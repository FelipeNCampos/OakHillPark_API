import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"

import { OpenAPI } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"

const searchSchema = z.object({
  op: z.string().optional().catch(""),
  operation: z.string().optional().catch(""),
  buildingId: z.string().optional().catch(""),
  building: z.string().optional().catch(""),
  buildingName: z.string().optional().catch(""),
})

type QueryParams = Record<string, string | number | boolean | null | undefined>
type RequestOptions = { method?: string; body?: unknown }
type ApiParams = QueryParams | RequestOptions

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

export const Route = createFileRoute("/caretaker-access")({
  component: CaretakerAccess,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        title: "Caretaker Access - OakHill Park",
      },
    ],
  }),
})

function CaretakerAccess() {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const search = Route.useSearch() as z.infer<typeof searchSchema>
  const { op, operation, buildingId, building, buildingName } = search
  const [showConfirmation, setShowConfirmation] = useState(false)

  const rawOperation = (op || operation || "").toLowerCase()
  const hasExplicitOperation = rawOperation === "in" || rawOperation === "out"
  const initialOperation = hasExplicitOperation ? rawOperation : ""
  const [selectedOperation, setSelectedOperation] = useState<"in" | "out" | "">(
    initialOperation as "in" | "out" | "",
  )
  const [hasUserSelected, setHasUserSelected] = useState(false)
  const [hasOpenSession, setHasOpenSession] = useState(false)
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(false)

  const operationLabel =
    selectedOperation === "in"
      ? "Entry"
      : selectedOperation === "out"
        ? "Exit"
        : ""

  const buildingLabel = building || buildingName || buildingId || ""

  const hasActiveSessionInBuilding =
    hasOpenSession &&
    activeBuildingId &&
    buildingId &&
    String(activeBuildingId) === String(buildingId)

  useEffect(() => {
    if (!buildingId) return
    let isActive = true

    setIsCheckingSession(true)
    publicApiCall("/api/v1/acess/caretaker/active")
      .then((data) => {
        if (!isActive) return
        const open = Boolean(data?.has_open_session)
        const activeId = data?.building_id ? String(data.building_id) : null
        setHasOpenSession(open)
        setActiveBuildingId(activeId)

        if (!hasExplicitOperation && !hasUserSelected) {
          if (open && activeId && String(activeId) === String(buildingId)) {
            setSelectedOperation("out")
          } else {
            setSelectedOperation("in")
          }
        }
      })
      .catch(() => {
        if (!isActive) return
        setHasOpenSession(false)
        setActiveBuildingId(null)
        if (!hasExplicitOperation && !hasUserSelected) {
          setSelectedOperation("in")
        }
      })
      .finally(() => {
        if (!isActive) return
        setIsCheckingSession(false)
      })

    return () => {
      isActive = false
    }
  }, [buildingId, hasExplicitOperation, hasUserSelected])

  useEffect(() => {
    if (hasActiveSessionInBuilding && selectedOperation === "in") {
      setSelectedOperation("out")
    }
  }, [hasActiveSessionInBuilding, selectedOperation])

  interface AcessPayload {
    status: boolean
    operacao: 0 | 1
    building_id: string
  }

  const mutation = useMutation({
    mutationFn: (payload: AcessPayload) =>
      publicApiCall("/api/v1/acess/caretaker", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Record confirmed")
      setShowConfirmation(true)
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

  const canSubmit = Boolean(operationLabel) && Boolean(buildingId)

  const handleConfirm = () => {
    if (!canSubmit) {
      showErrorToast("Invalid QR code. Check building and operation.")
      return
    }

    if (!buildingId) {
      showErrorToast("Invalid QR code. Building not found.")
      return
    }

    const payload: AcessPayload = {
      status: true,
      operacao: selectedOperation === "in" ? 0 : 1,
      building_id: buildingId,
    }

    mutation.mutate(payload)
  }

  return (
    <div className="min-h-screen bg-[#f5f1ee] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-center text-2xl font-bold text-[#55311c]">
            Caretaker Access
          </h1>
          <p className="mb-6 text-center text-[rgba(0,0,0,0.7)]">
            Choose the operation and confirm the record.
          </p>

          <div className="space-y-4">
            <div className="rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
              <p className="text-sm font-semibold text-[#55311c]">Building</p>
              <p className="text-lg font-bold text-[#55311c]">
                {buildingLabel || "Not provided"}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-[#55311c]">
              Operation
            </p>
            <div className="flex rounded-full bg-[#f5f1ee] p-1">
              {!hasActiveSessionInBuilding && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOperation("in")
                    setHasUserSelected(true)
                  }}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                    selectedOperation === "in"
                      ? "bg-[#8c7569] text-white shadow"
                      : "text-[#55311c] hover:bg-[#e8e1dc]"
                  }`}
                >
                  IN
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedOperation("out")
                  setHasUserSelected(true)
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
            {isCheckingSession && (
              <p className="mt-2 text-xs text-[rgba(0,0,0,0.6)]">
                Checking active session...
              </p>
            )}
            {!isCheckingSession && hasActiveSessionInBuilding && (
              <p className="mt-2 text-xs text-[rgba(0,0,0,0.6)]">
                Active session in this building. Only OUT available.
              </p>
            )}
          </div>

          {!canSubmit && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
              Invalid QR code. Make sure building and operation are set.
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending || !canSubmit}
            className="mt-6 w-full rounded-lg bg-[#8c7569] px-6 py-3 text-lg font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Sending..." : "Confirm"}
          </button>
        </div>
      </div>

      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-xl font-bold text-[#55311c]">
              Record confirmed
            </h2>
            <p className="mt-2 text-sm text-[rgba(0,0,0,0.7)]">
              This page will close in 5 seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
