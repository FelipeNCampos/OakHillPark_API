import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { z } from "zod"

import { OpenAPI } from "@/client"
import { enforceHttpsUrl, resolveApiBase } from "@/config/api"
import useCustomToast from "@/hooks/useCustomToast"

const CONTRACTOR_HIDDEN_BUILDING_NAMES = new Set([
  "cleaner",
  "caretaker",
  "contractor",
])
const PUBLIC_ACCESS_UPDATE_STORAGE_KEY = "oakhill-public-access-updated"

const notifyPublicAccessUpdate = () => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PUBLIC_ACCESS_UPDATE_STORAGE_KEY, String(Date.now()))
}

const searchSchema = z.object({
  condominioId: z.string().optional().catch(""),
})

type QueryParams = Record<string, string | number | boolean | null | undefined>
type RequestOptions = { method?: string; body?: unknown }
type ApiParams = QueryParams | RequestOptions

type ContractorOpenVisit = {
  id: string
  name: string
  company: string
  building_name: string
  job_description: string
  mobile: string
  in_at: string
}

type ContractorBuilding = {
  id: string
  name: string
}

type ContractorVisitResponse = {
  id: string
  name: string
  company: string
  building_name: string
  door_code?: string | null
  job_description: string
  mobile: string
  in_at: string
  out_at: string | null
  condominio_id: string
}

type ContractorConfirmation = {
  operation: "in" | "out"
  buildingName: string
  doorCode: string | null
}

const getDoorCodeLines = (value?: string | null) =>
  value
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean) || []

const isRequestOptions = (params?: ApiParams): params is RequestOptions => {
  if (!params || typeof params !== "object") return false
  return "method" in params || "body" in params
}

const publicApiCall = async (endpoint: string, params?: ApiParams) => {
  const url = new URL(
    enforceHttpsUrl(`${resolveApiBase(OpenAPI.BASE)}${endpoint}`),
  )
  const requestOptions = isRequestOptions(params) ? params : undefined

  if (!requestOptions && params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value))
      }
    })
  }

  const options: RequestInit = {
    method: requestOptions?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }

  if (requestOptions?.body !== undefined) {
    options.body =
      typeof requestOptions.body === "string"
        ? requestOptions.body
        : JSON.stringify(requestOptions.body)
  }

  const response = await fetch(url.toString(), options)
  if (!response.ok) {
    let message = "API call failed"
    try {
      const payload = await response.json()
      message = payload?.detail || payload?.message || message
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  return response.json()
}

export const Route = createFileRoute("/contractor-access" as any)({
  component: ContractorAccess,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        title: "Contractor Access - OakHill Park",
      },
    ],
  }),
})

function ContractorAccess() {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const search = Route.useSearch() as z.infer<typeof searchSchema>
  const { condominioId } = search
  const [selectedOperation, setSelectedOperation] = useState<"in" | "out">("in")
  const [confirmation, setConfirmation] =
    useState<ContractorConfirmation | null>(null)
  const [selectedVisitId, setSelectedVisitId] = useState("")
  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [buildingId, setBuildingId] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [mobile, setMobile] = useState("")

  const buildingsQuery = useQuery<{
    data: ContractorBuilding[]
    count: number
  }>({
    queryKey: ["contractor-buildings", condominioId],
    queryFn: () =>
      publicApiCall("/api/v1/contractor-access/buildings", {
        condominio_id: condominioId,
      }),
    enabled: Boolean(condominioId),
  })

  const openVisitsQuery = useQuery<{
    data: ContractorOpenVisit[]
    count: number
  }>({
    queryKey: ["contractor-open-visits", condominioId],
    queryFn: () =>
      publicApiCall("/api/v1/contractor-access/open", {
        condominio_id: condominioId,
      }),
    enabled: Boolean(condominioId) && selectedOperation === "out",
  })

  const openVisitOptions = openVisitsQuery.data?.data || []
  const availableBuildings = useMemo(
    () =>
      (buildingsQuery.data?.data || []).filter((building) => {
        const normalizedName = building.name.trim().toLowerCase()
        return !CONTRACTOR_HIDDEN_BUILDING_NAMES.has(normalizedName)
      }),
    [buildingsQuery.data?.data],
  )

  const selectedVisit = useMemo(
    () => openVisitOptions.find((item) => item.id === selectedVisitId) || null,
    [openVisitOptions, selectedVisitId],
  )

  const mutation = useMutation<ContractorVisitResponse>({
    mutationFn: () => {
      if (!condominioId) {
        throw new Error("Invalid QR code. Condominio not found.")
      }

      if (selectedOperation === "in") {
        return publicApiCall("/api/v1/contractor-access/check-in", {
          method: "POST",
          body: {
            condominio_id: condominioId,
            name,
            company,
            building_id: buildingId,
            job_description: jobDescription,
            mobile,
          },
        })
      }

      return publicApiCall("/api/v1/contractor-access/check-out", {
        method: "POST",
        body: {
          condominio_id: condominioId,
          visit_id: selectedVisitId,
        },
      })
    },
    onSuccess: (response) => {
      const operation = response.out_at ? "out" : "in"
      notifyPublicAccessUpdate()
      showSuccessToast("Record confirmed")
      setConfirmation({
        operation,
        buildingName: response.building_name,
        doorCode: response.door_code?.trim() || null,
      })
      if (operation === "in") {
        setName("")
        setCompany("")
        setBuildingId("")
        setJobDescription("")
        setMobile("")
      } else {
        setSelectedVisitId("")
        void openVisitsQuery.refetch()
        setTimeout(() => {
          if (typeof window !== "undefined") {
            window.close()
            window.location.href = "about:blank"
          }
        }, 5000)
      }
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Unable to submit the record"
      showErrorToast(message)
    },
  })

  const canSubmit =
    Boolean(condominioId) &&
    (selectedOperation === "in"
      ? [name, company, buildingId, jobDescription, mobile].every((value) =>
          value.trim(),
        )
      : Boolean(selectedVisitId))

  const formatCheckInDate = (value: string) =>
    new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <div className="mobile-page-shell min-h-screen bg-[#f5f1ee] px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mobile-page-panel rounded-2xl bg-white p-5 shadow-lg sm:p-8">
          <h1 className="mb-2 text-center text-2xl font-bold text-[#55311c]">
            Contractor Access
          </h1>
          <p className="mb-6 text-center text-[rgba(0,0,0,0.7)]">
            Select IN or OUT and confirm the contractor record.
          </p>

          <div className="mt-2">
            <p className="mb-2 text-sm font-semibold text-[#55311c]">
              Operation
            </p>
            <div className="flex flex-col rounded-2xl bg-[#f5f1ee] p-1 sm:flex-row sm:rounded-full">
              <button
                type="button"
                onClick={() => {
                  setSelectedOperation("in")
                  setSelectedVisitId("")
                  setConfirmation(null)
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  selectedOperation === "in"
                    ? "bg-[#8c7569] text-white shadow"
                    : "text-[#55311c] hover:bg-[#e8e1dc]"
                }`}
              >
                IN
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedOperation("out")
                  setSelectedVisitId("")
                  setConfirmation(null)
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  selectedOperation === "out"
                    ? "bg-[#8c7569] text-white shadow"
                    : "text-[#55311c] hover:bg-[#e8e1dc]"
                }`}
              >
                OUT
              </button>
            </div>
          </div>

          {selectedOperation === "in" ? (
            <div className="mt-6 grid gap-4">
              <div>
                <label
                  htmlFor="contractor-name"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Name
                </label>
                <input
                  id="contractor-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="contractor-company"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Company
                </label>
                <input
                  id="contractor-company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="contractor-building"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Building
                </label>
                <select
                  id="contractor-building"
                  value={buildingId}
                  onChange={(event) => setBuildingId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="">
                    {buildingsQuery.isLoading
                      ? "Loading buildings..."
                      : "Select a building"}
                  </option>
                  {availableBuildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="contractor-job-description"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Job description
                </label>
                <input
                  id="contractor-job-description"
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              {!buildingsQuery.isLoading && availableBuildings.length === 0 && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
                    No buildings are available for this QR code.
                  </div>
                )}
              <div>
                <label
                  htmlFor="contractor-mobile"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Mobile
                </label>
                <input
                  id="contractor-mobile"
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <div>
                <label
                  htmlFor="contractor-open-visit"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Mobile
                </label>
                <select
                  id="contractor-open-visit"
                  value={selectedVisitId}
                  onChange={(event) => setSelectedVisitId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="">Select a mobile number</option>
                  {openVisitOptions.map((visit) => (
                    <option key={visit.id} value={visit.id}>
                      {visit.mobile}
                    </option>
                  ))}
                </select>
              </div>

              {openVisitsQuery.isLoading && (
                <p className="text-sm text-[rgba(0,0,0,0.6)]">
                  Loading open contractor records...
                </p>
              )}

              {!openVisitsQuery.isLoading && openVisitOptions.length === 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
                  No contractors currently checked in.
                </div>
              )}

              {selectedVisit && (
                <div className="rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4 text-sm text-[#55311c] break-words">
                  <p>
                    <strong>Mobile:</strong> {selectedVisit.mobile}
                  </p>
                  <p>
                    <strong>Name:</strong> {selectedVisit.name}
                  </p>
                  <p>
                    <strong>Company:</strong> {selectedVisit.company}
                  </p>
                  <p>
                    <strong>Building:</strong> {selectedVisit.building_name}
                  </p>
                  <p>
                    <strong>Job description:</strong>{" "}
                    {selectedVisit.job_description}
                  </p>
                  <p>
                    <strong>Check-in:</strong>{" "}
                    {formatCheckInDate(selectedVisit.in_at)}
                  </p>
                </div>
              )}
            </div>
          )}

          {!condominioId && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
              Invalid QR code.
            </div>
          )}

          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="mt-6 w-full rounded-lg bg-[#8c7569] px-6 py-3 text-lg font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Sending..." : "Confirm"}
          </button>
        </div>
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-2xl font-bold text-[#55311c]">
              Record confirmed
            </h2>
            <p className="mt-3 text-[rgba(0,0,0,0.7)]">
              {confirmation.operation === "in"
                ? "The contractor has been checked in successfully."
                : "The contractor has been checked out successfully."}
            </p>
            {confirmation.operation === "out" && (
              <p className="mt-2 text-sm text-[rgba(0,0,0,0.7)]">
                This page will close in 5 seconds.
              </p>
            )}
            {confirmation.operation === "in" && confirmation.doorCode && (
              <div className="mt-5 rounded-2xl border border-[#e5e0dc] bg-[#f9f7f5] p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8c7569]">
                  Building
                </p>
                <p className="mt-2 text-base font-semibold text-[#55311c]">
                  {confirmation.buildingName}
                </p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-[#8c7569]">
                  Door code
                </p>
                <div className="mt-2 rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-[#e5e0dc]">
                  <div className="space-y-3">
                    {getDoorCodeLines(confirmation.doorCode).map((line) => {
                      const [label, ...codeParts] = line.split(":")
                      const code = codeParts.join(":").trim()
                      const hasLabel = Boolean(code)

                      return (
                        <div
                          key={line}
                          className={`${
                            hasLabel
                              ? "flex items-center justify-between gap-3 rounded-xl bg-[#f9f7f5] px-3 py-3"
                              : "text-center"
                          }`}
                        >
                          {hasLabel ? (
                            <>
                              <span className="text-sm font-semibold text-[#55311c]">
                                {label.trim()}
                              </span>
                              <span className="font-mono text-lg font-bold tracking-[0.18em] text-[#55311c] sm:text-xl">
                                {code}
                              </span>
                            </>
                          ) : (
                            <p className="font-mono text-3xl font-bold tracking-[0.32em] text-[#55311c]">
                              {line}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {confirmation.operation === "in" && (
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="mt-6 w-full rounded-lg bg-[#8c7569] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#55311c]"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
