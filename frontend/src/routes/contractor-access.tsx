import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { z } from "zod"

import { OpenAPI } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"

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
  block: string
  mobile: string
  in_at: string
}

const isRequestOptions = (params?: ApiParams): params is RequestOptions => {
  if (!params || typeof params !== "object") return false
  return "method" in params || "body" in params
}

const publicApiCall = async (endpoint: string, params?: ApiParams) => {
  const url = new URL(`${OpenAPI.BASE || "http://localhost:8000"}${endpoint}`)
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
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [selectedVisitId, setSelectedVisitId] = useState("")
  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [carReg, setCarReg] = useState("")
  const [block, setBlock] = useState("")
  const [mobile, setMobile] = useState("")

  const openVisitsQuery = useQuery<{ data: ContractorOpenVisit[]; count: number }>({
    queryKey: ["contractor-open-visits", condominioId],
    queryFn: () =>
      publicApiCall("/api/v1/contractor-access/open", {
        condominio_id: condominioId,
      }),
    enabled: Boolean(condominioId) && selectedOperation === "out",
  })

  const openVisitOptions = openVisitsQuery.data?.data || []

  const selectedVisit = useMemo(
    () => openVisitOptions.find((item) => item.id === selectedVisitId) || null,
    [openVisitOptions, selectedVisitId],
  )

  const mutation = useMutation({
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
            car_reg: carReg,
            block,
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
    onSuccess: () => {
      showSuccessToast("Record confirmed")
      setShowConfirmation(true)
      if (selectedOperation === "in") {
        setName("")
        setCompany("")
        setCarReg("")
        setBlock("")
        setMobile("")
      } else {
        setSelectedVisitId("")
        void openVisitsQuery.refetch()
      }
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.close()
          window.location.href = "about:blank"
        }
      }, 5000)
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
      ? [name, company, carReg, block, mobile].every((value) => value.trim())
      : Boolean(selectedVisitId))

  return (
    <div className="min-h-screen bg-[#f5f1ee] px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-white p-5 shadow-lg sm:p-8">
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
                onClick={() => setSelectedOperation("in")}
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
                onClick={() => setSelectedOperation("out")}
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
                  htmlFor="contractor-car-reg"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Car reg
                </label>
                <input
                  id="contractor-car-reg"
                  value={carReg}
                  onChange={(event) => setCarReg(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="contractor-block"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Block
                </label>
                <input
                  id="contractor-block"
                  value={block}
                  onChange={(event) => setBlock(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
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
                  <option value="">Select a contractor</option>
                  {openVisitOptions.map((visit) => (
                    <option key={visit.id} value={visit.id}>
                      {`${visit.mobile} | ${visit.name} | ${visit.company} | ${visit.block} | ${new Date(visit.in_at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`}
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
                <div className="rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4 text-sm text-[#55311c]">
                  <p>
                    <strong>Name:</strong> {selectedVisit.name}
                  </p>
                  <p>
                    <strong>Company:</strong> {selectedVisit.company}
                  </p>
                  <p>
                    <strong>Block:</strong> {selectedVisit.block}
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

      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-2xl font-bold text-[#55311c]">Thank you!</h2>
            <p className="mt-3 text-[rgba(0,0,0,0.7)]">
              Your contractor record has been saved successfully.
            </p>
            <p className="mt-4 text-sm text-[rgba(0,0,0,0.55)]">
              This window will close automatically in a few seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
