import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
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

const publicApiCall = async (
  endpoint: string,
  params?: Record<string, any> | { method?: string; body?: any },
) => {
  const url = new URL(`${OpenAPI.BASE || "http://localhost:8000"}${endpoint}`)
  const isRequestWithMethod = params && "method" in params

  if (!isRequestWithMethod && params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value))
      }
    })  
  }

  const options: RequestInit = {
    method: isRequestWithMethod ? (params as any).method || "GET" : "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }

  if (isRequestWithMethod && (params as any).body !== undefined) {
    options.body =
      typeof (params as any).body === "string"
        ? (params as any).body
        : JSON.stringify((params as any).body)
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

export const Route = createFileRoute("/cleaner-access" as any)({
  component: CleanerAccess,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        title: "Cleaner Access - OakHill Park",
      },
    ],
  }),
})

function CleanerAccess() {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const search = Route.useSearch() as z.infer<typeof searchSchema>
  const { op, operation, buildingId, building, buildingName } = search

  const rawOperation = (op || operation || "").toLowerCase()
  const operationLabel =
    rawOperation === "in"
      ? "Entrada"
      : rawOperation === "out"
        ? "Saída"
        : ""

  const cleanerName = "Cleaner padrão"
  const buildingLabel = building || buildingName || buildingId || ""

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      publicApiCall("/api/v1/acess/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Registro enviado com sucesso")
    },
    onError: (error: any) => {
      showErrorToast(error?.message || "Não foi possível enviar o registro")
    },
  })

  const canSubmit = Boolean(operationLabel) && Boolean(buildingId)

  const handleConfirm = () => {
    if (!canSubmit) {
      showErrorToast("QRCode inválido. Verifique operação e building.")
      return
    }

    const payload: any = {
      status: true,
      operacao: rawOperation === "in" ? 0 : 1,
      building_id: buildingId,
    }

    mutation.mutate(payload)
  }

  return (
    <div className="min-h-screen bg-[#f5f1ee] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-center text-2xl font-bold text-[#55311c]">
            Registro de {operationLabel || "Acesso"}
          </h1>
          <p className="mb-6 text-center text-[rgba(0,0,0,0.7)]">
            Confirme os dados abaixo para enviar o registro.
          </p>

          <div className="space-y-4">
            <div className="rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
              <p className="text-sm font-semibold text-[#55311c]">Operação</p>
              <p className="text-lg font-bold text-[#55311c]">
                {operationLabel || "Não informado"}
              </p>
            </div>
            <div className="rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
              <p className="text-sm font-semibold text-[#55311c]">Building</p>
              <p className="text-lg font-bold text-[#55311c]">
                {buildingLabel || "Não informado"}
              </p>
            </div>
            <div className="rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
              <p className="text-sm font-semibold text-[#55311c]">Cleaner</p>
              <p className="text-lg font-bold text-[#55311c]">
                {cleanerName || "Cleaner ativo não definido"}
              </p>
            </div>
          </div>

          {!canSubmit && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
              QRCode inválido. Verifique se possui operação e building.
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending || !canSubmit}
            className="mt-6 w-full rounded-lg bg-[#8c7569] px-6 py-3 text-lg font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Enviando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  )
}
