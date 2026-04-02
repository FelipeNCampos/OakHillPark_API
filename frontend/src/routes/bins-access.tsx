import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"

import { OpenAPI } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"

const searchSchema = z.object({
  buildingId: z.string().optional().catch(""),
  collectionType: z.string().optional().catch(""),
  collectionStatus: z.string().optional().catch(""),
})

type RequestOptions = { method?: string; body?: unknown }

const resolveApiBase = () => {
  if (OpenAPI.BASE) return OpenAPI.BASE
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location
    if (hostname.startsWith("dashboard.")) {
      return `${protocol}//api.${hostname.slice("dashboard.".length)}`
    }
    if (hostname === "localhost" && port === "5173") {
      return "http://localhost:8000"
    }
    return `${protocol}//${hostname}${port ? `:${port}` : ""}`
  }
  return "http://localhost:8000"
}

const publicApiCall = async (endpoint: string, options?: RequestOptions) => {
  const url = new URL(`${resolveApiBase()}${endpoint}`)
  const requestOptions = options || {}

  const request: RequestInit = {
    method: requestOptions.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }

  if (requestOptions.body !== undefined) {
    request.body =
      typeof requestOptions.body === "string"
        ? requestOptions.body
        : JSON.stringify(requestOptions.body)
  }

  const response = await fetch(url.toString(), request)
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

export const Route = createFileRoute("/bins-access" as any)({
  component: BinsAccess,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        title: "Bin Miss Collection - OakHill Park",
      },
    ],
  }),
})

function BinsAccess() {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const search = Route.useSearch() as z.infer<typeof searchSchema>
  const { buildingId, collectionType, collectionStatus } = search
  const [showConfirmation, setShowConfirmation] = useState(false)

  const [selectedType, setSelectedType] = useState<"general" | "recycle">(
    collectionType?.toLowerCase() === "recycle" ? "recycle" : "general",
  )
  const [selectedStatus, setSelectedStatus] = useState<"miss" | "late">(
    collectionStatus?.toLowerCase() === "late" ? "late" : "miss",
  )

  const mutation = useMutation({
    mutationFn: (payload: {
      building_id: string
      collection_type: "general" | "recycle"
      collection_status: "miss" | "late"
      miss_collection: boolean
    }) =>
      publicApiCall("/api/v1/bins/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Collection record saved")
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

  const handleConfirm = () => {
    if (!buildingId) {
      showErrorToast("Invalid QR code.")
      return
    }

    mutation.mutate({
      building_id: buildingId,
      collection_type: selectedType,
      collection_status: selectedStatus,
      miss_collection: selectedStatus === "miss",
    })
  }

  return (
    <div className="mobile-page-shell min-h-screen bg-[#f5f1ee] px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mobile-page-panel rounded-2xl bg-white p-5 shadow-lg sm:p-8">
          <h1 className="mb-2 text-center text-2xl font-bold text-[#55311c]">
            MISS COLLECTION
          </h1>
          <p className="mb-6 text-center text-[rgba(0,0,0,0.7)]">
            Register miss or late collection for the week.
          </p>

          <div className="mt-2">
            <p className="mb-2 text-sm font-semibold text-[#55311c]">
              Bin type
            </p>
            <div className="flex flex-col rounded-2xl bg-[#f5f1ee] p-1 sm:flex-row sm:rounded-full">
              <button
                type="button"
                onClick={() => setSelectedType("general")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  selectedType === "general"
                    ? "bg-[#8c7569] text-white shadow"
                    : "text-[#55311c] hover:bg-[#e8e1dc]"
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setSelectedType("recycle")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  selectedType === "recycle"
                    ? "bg-[#8c7569] text-white shadow"
                    : "text-[#55311c] hover:bg-[#e8e1dc]"
                }`}
              >
                Recycle
              </button>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-[#55311c]">
              Collection status
            </p>
            <div className="flex flex-col rounded-2xl bg-[#f5f1ee] p-1 sm:flex-row sm:rounded-full">
              <button
                type="button"
                onClick={() => setSelectedStatus("miss")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  selectedStatus === "miss"
                    ? "bg-[#8c7569] text-white shadow"
                    : "text-[#55311c] hover:bg-[#e8e1dc]"
                }`}
              >
                Miss Collection
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("late")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  selectedStatus === "late"
                    ? "bg-[#8c7569] text-white shadow"
                    : "text-[#55311c] hover:bg-[#e8e1dc]"
                }`}
              >
                Collected
              </button>
            </div>
          </div>

          {!buildingId && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
              Invalid QR code.
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending || !buildingId}
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
