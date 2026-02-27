import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"

import { OpenAPI } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"

const searchSchema = z.object({
  buildingId: z.string().optional().catch(""),
  building: z.string().optional().catch(""),
  buildingName: z.string().optional().catch(""),
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
        title: "Bins Access - OakHill Park",
      },
    ],
  }),
})

function BinsAccess() {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const search = Route.useSearch() as z.infer<typeof searchSchema>
  const { buildingId, building, buildingName } = search
  const [showConfirmation, setShowConfirmation] = useState(false)

  const buildingLabel = building || buildingName || buildingId || ""

  const mutation = useMutation({
    mutationFn: (payload: { building_id: string; miss_collection: boolean }) =>
      publicApiCall("/api/v1/bins/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Miss collection recorded")
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
      showErrorToast("Invalid QR code. Building not found.")
      return
    }

    mutation.mutate({
      building_id: buildingId,
      miss_collection: true,
    })
  }

  return (
    <div className="min-h-screen bg-[#f5f1ee] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-center text-2xl font-bold text-[#55311c]">
            Bins - Miss Collection
          </h1>
          <p className="mb-6 text-center text-[rgba(0,0,0,0.7)]">
            Confirm missed collection for this building.
          </p>

          <div className="rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
            <p className="text-sm font-semibold text-[#55311c]">Building</p>
            <p className="text-lg font-bold text-[#55311c]">
              {buildingLabel || "Not provided"}
            </p>
          </div>

          {!buildingId && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
              Invalid QR code. Make sure building is set.
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending || !buildingId}
            className="mt-6 w-full rounded-lg bg-[#8c7569] px-6 py-3 text-lg font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Sending..." : "Miss Collection"}
          </button>
        </div>
      </div>

      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-xl font-bold text-[#55311c]">Record confirmed</h2>
            <p className="mt-2 text-sm text-[rgba(0,0,0,0.7)]">
              This page will close in 5 seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
