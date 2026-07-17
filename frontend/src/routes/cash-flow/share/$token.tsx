import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FileText } from "lucide-react"
import { useState } from "react"
import { OpenAPI } from "@/client"
import { enforceHttpsUrl, resolveApiBase } from "@/config/api"

interface SharedCashFlowRecord {
  id: string
  payment_number: number
  has_invoice: boolean
  invoice_media_name: string | null
  invoice_media_data: string | null
  record_date: string
  amount: number
  supplier: string
  description: string
  location: string
  reason: string
}

interface SharedCashFlowResponse {
  data: SharedCashFlowRecord[]
  count: number
  date_from: string
  date_to: string
  credits_total: number
  debits_total: number
  balance: number
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value)

const formatDate = (value: string) => {
  const [year, month, day] = value.split("-")
  return year && month && day ? `${day}/${month}/${year}` : value
}

const publicCashFlowUrl = (token: string) =>
  `${enforceHttpsUrl(resolveApiBase(OpenAPI.BASE))}/api/v1/cash-flow/shared/${encodeURIComponent(token)}`

export const Route = createFileRoute("/cash-flow/share/$token")({
  component: SharedCashFlowPage,
  head: () => ({
    meta: [{ title: "Shared Petty Cash - OakHill Park" }],
  }),
})

function SharedCashFlowPage() {
  const { token } = Route.useParams()
  const [invoice, setInvoice] = useState<SharedCashFlowRecord | null>(null)
  const sharedCashFlowQuery = useQuery<SharedCashFlowResponse>({
    queryKey: ["shared-cash-flow", token],
    queryFn: async () => {
      const response = await fetch(publicCashFlowUrl(token))
      if (!response.ok) throw new Error("This shared cash flow link is unavailable.")
      return response.json() as Promise<SharedCashFlowResponse>
    },
    retry: false,
  })

  if (sharedCashFlowQuery.isLoading) {
    return <SharedCashFlowState message="Loading shared petty cash..." />
  }
  if (sharedCashFlowQuery.isError || !sharedCashFlowQuery.data) {
    return <SharedCashFlowState message="This shared cash flow link is unavailable." />
  }

  const shared = sharedCashFlowQuery.data
  return (
    <main className="min-h-screen bg-[#f5f1ee] px-4 py-8 text-[#55311c] sm:px-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-[#e5e0dc] bg-white p-6 shadow-md">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[rgba(85,49,28,0.72)]">
            Read-only shared view
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Shared Petty Cash</h1>
          <p className="mt-2 text-sm font-semibold text-black/65">
            {formatDate(shared.date_from)} to {formatDate(shared.date_to)}
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Credits" value={formatCurrency(shared.credits_total)} />
          <SummaryCard label="Debits" value={formatCurrency(shared.debits_total)} />
          <SummaryCard label="Balance" value={formatCurrency(shared.balance)} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e5e0dc] bg-white shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-[#faf8f6] text-[11px] uppercase text-[rgba(85,49,28,0.72)]">
                <tr>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e0dc]">
                {shared.data.length ? (
                  shared.data.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-bold">#{record.payment_number}</td>
                      <td className="px-4 py-3">{formatDate(record.record_date)}</td>
                      <td className="px-4 py-3 text-right font-extrabold">
                        {formatCurrency(record.amount)}
                      </td>
                      <td className="px-4 py-3">{record.supplier || "-"}</td>
                      <td className="px-4 py-3">{record.description || "-"}</td>
                      <td className="px-4 py-3">{record.location || "-"}</td>
                      <td className="px-4 py-3">{record.reason || "-"}</td>
                      <td className="px-4 py-3">
                        {record.invoice_media_data ? (
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9d0ca] px-2.5 py-1.5 text-xs font-extrabold transition hover:bg-[#faf8f6]"
                            type="button"
                            onClick={() => setInvoice(record)}
                          >
                            <FileText size={14} />
                            View invoice
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-black/60" colSpan={8}>
                      No records for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {invoice?.invoice_media_data ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-extrabold">{invoice.invoice_media_name || "Invoice"}</h2>
              <button
                className="rounded-lg border border-[#d9d0ca] px-3 py-1.5 text-sm font-bold"
                type="button"
                onClick={() => setInvoice(null)}
              >
                Close
              </button>
            </div>
            {invoice.invoice_media_data.startsWith("data:application/pdf") ? (
              <iframe
                className="h-[70vh] w-full"
                src={invoice.invoice_media_data}
                title={invoice.invoice_media_name || "Invoice"}
              />
            ) : (
              <img
                alt={invoice.invoice_media_name || "Invoice"}
                className="max-h-[70vh] w-full object-contain"
                src={invoice.invoice_media_data}
              />
            )}
          </section>
        </div>
      ) : null}
    </main>
  )
}

function SharedCashFlowState({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f1ee] p-4 text-center text-[#55311c]">
      <section className="max-w-md rounded-2xl border border-[#e5e0dc] bg-white p-8 shadow-md">
        <h1 className="text-2xl font-extrabold">Shared Petty Cash</h1>
        <p className="mt-3 text-sm font-semibold text-black/65">{message}</p>
      </section>
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[#e5e0dc] bg-white p-5 shadow-md">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[rgba(85,49,28,0.72)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </article>
  )
}
