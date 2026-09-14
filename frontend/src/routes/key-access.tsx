import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"

import { OpenAPI } from "@/client"
import { enforceHttpsUrl, resolveApiBase } from "@/config/api"
import useCustomToast from "@/hooks/useCustomToast"

const searchSchema = z.object({
  flatId: z.string().optional().catch(""),
})

type RequestOptions = { method?: string; body?: unknown }

type PublicKey = {
  flat_id: string
  building_name: string
  flat_numero: number
  flat_label: string | null
  key_code: string
  is_checked_out: boolean
}

const publicApiCall = async (endpoint: string, options?: RequestOptions) => {
  const response = await fetch(
    enforceHttpsUrl(`${resolveApiBase(OpenAPI.BASE)}${endpoint}`),
    {
      method: options?.method || "GET",
      headers: { "Content-Type": "application/json" },
      body:
        options?.body === undefined ? undefined : JSON.stringify(options.body),
    },
  )

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail || "Não foi possível registrar a chave")
  }
  return response.json()
}

export const Route = createFileRoute("/key-access" as any)({
  component: KeyAccess,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Controle de chaves - OakHill Park" }] }),
})

function KeyAccess() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const { flatId } = Route.useSearch() as z.infer<typeof searchSchema>
  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")
  const [confirmation, setConfirmation] = useState("")

  const keyQuery = useQuery<PublicKey>({
    queryKey: ["public-key-access", flatId],
    queryFn: () => publicApiCall(`/api/v1/key-access/public/${flatId}`),
    enabled: Boolean(flatId),
  })

  const key = keyQuery.data
  const mutation = useMutation({
    mutationFn: () => {
      if (!flatId || !key) throw new Error("QR code inválido")
      const operation = key.is_checked_out ? "checkin" : "checkout"
      return publicApiCall(`/api/v1/key-access/public/${flatId}/${operation}`, {
        method: "POST",
        body: key.is_checked_out
          ? { returned_by_name: name, returned_by_mobile: mobile }
          : { holder_name: name, holder_mobile: mobile },
      })
    },
    onSuccess: () => {
      const action = key?.is_checked_out ? "devolvida" : "retirada"
      setName("")
      setMobile("")
      setConfirmation(`Chave ${action} com sucesso.`)
      showSuccessToast(`Chave ${action} com sucesso`)
      void keyQuery.refetch()
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a chave",
      )
      void keyQuery.refetch()
    },
  })

  useEffect(() => {
    if (!confirmation) return
    const timeout = window.setTimeout(() => setConfirmation(""), 5000)
    return () => window.clearTimeout(timeout)
  }, [confirmation])

  const flatLabel = key?.flat_label?.trim() || String(key?.flat_numero || "")
  const isReturning = Boolean(key?.is_checked_out)
  const canSubmit = Boolean(name.trim() && mobile.trim() && key)

  return (
    <div className="mobile-page-shell min-h-screen bg-[#f5f1ee] px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mobile-page-panel rounded-2xl bg-white p-5 shadow-lg sm:p-8">
          <h1 className="text-center text-2xl font-bold text-[#55311c]">
            Controle de chaves
          </h1>
          <p className="mt-2 text-center text-sm text-[rgba(0,0,0,0.7)]">
            Registre a retirada ou devolução desta chave.
          </p>

          {!flatId && <Message text="QR code inválido." isError />}
          {flatId && keyQuery.isLoading && (
            <Message text="Carregando chave..." />
          )}
          {flatId && keyQuery.isError && (
            <Message
              text={
                keyQuery.error instanceof Error
                  ? keyQuery.error.message
                  : "Não foi possível carregar a chave."
              }
              isError
            />
          )}

          {key && (
            <>
              <div className="mt-6 rounded-2xl border border-[#e5e0dc] bg-[#faf8f6] p-5 text-center">
                <p className="text-sm font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.7)]">
                  Código da chave
                </p>
                <p className="mt-1 text-3xl font-bold text-[#55311c]">
                  {key.key_code}
                </p>
                <p className="mt-3 text-sm text-[rgba(0,0,0,0.7)]">
                  {key.building_name} · Flat {flatLabel}
                </p>
                <span
                  className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                    key.is_checked_out
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {key.is_checked_out ? "Chave fora" : "Chave disponível"}
                </span>
              </div>

              <form
                className="mt-6"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (canSubmit) mutation.mutate()
                }}
              >
                <h2 className="text-lg font-bold text-[#55311c]">
                  {isReturning ? "Registrar devolução" : "Registrar retirada"}
                </h2>
                <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
                  Informe os dados de quem está{" "}
                  {isReturning ? "devolvendo" : "retirando"} a chave.
                </p>

                <label className="mt-5 block text-sm font-semibold text-[#55311c]">
                  Nome completo
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                    className="mt-2 w-full rounded-lg border border-[#ddd] px-4 py-3 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                    placeholder={
                      isReturning
                        ? "Nome de quem devolve a chave"
                        : "Nome de quem pega a chave"
                    }
                  />
                </label>

                <label className="mt-4 block text-sm font-semibold text-[#55311c]">
                  Número de telefone
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    autoComplete="tel"
                    required
                    className="mt-2 w-full rounded-lg border border-[#ddd] px-4 py-3 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                    placeholder="Número de telefone"
                  />
                </label>

                <button
                  type="submit"
                  disabled={!canSubmit || mutation.isPending}
                  className="mt-6 w-full rounded-lg bg-[#8c7569] px-6 py-3 text-lg font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mutation.isPending
                    ? "Registrando..."
                    : isReturning
                      ? "Confirmar devolução"
                      : "Confirmar retirada"}
                </button>
              </form>
            </>
          )}

          {confirmation && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-800">
              {confirmation}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Message({
  text,
  isError = false,
}: {
  text: string
  isError?: boolean
}) {
  return (
    <div
      className={`mt-6 rounded-lg p-4 text-center text-sm ${
        isError
          ? "border border-red-200 bg-red-50 text-red-700"
          : "bg-[#f5f1ee] text-[#55311c]"
      }`}
    >
      {text}
    </div>
  )
}
