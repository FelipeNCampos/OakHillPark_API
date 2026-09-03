import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"

import { OpenAPI } from "@/client"
import { enforceHttpsUrl, resolveApiBase } from "@/config/api"
import useCustomToast from "@/hooks/useCustomToast"

interface GoogleCalendarStatus {
  connected: boolean
  status: "active" | "disconnected" | "reconnect_required" | string
  calendar_name?: string | null
  account_email?: string | null
  last_synced_at?: string | null
  pending_jobs: number
  last_error?: string | null
}

const googleCalendarApiCall = async (endpoint: string, method = "GET") => {
  const response = await fetch(
    enforceHttpsUrl(`${resolveApiBase(OpenAPI.BASE)}${endpoint}`),
    {
      method,
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Content-Type": "application/json",
      },
    },
  )
  if (!response.ok) {
    let message = "Google Calendar request failed"
    try {
      const payload = (await response.json()) as {
        detail?: string
        message?: string
      }
      message = payload.detail || payload.message || message
    } catch {
      // A network proxy may return a response without JSON.
    }
    throw new Error(message)
  }
  return response.json()
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not synchronized yet"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Not synchronized yet"
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function GoogleCalendarIntegrationCard() {
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const statusQuery = useQuery<GoogleCalendarStatus>({
    queryKey: ["google-calendar-integration"],
    queryFn: () =>
      googleCalendarApiCall("/api/v1/calendar-integrations/google/status"),
    refetchInterval: (query) =>
      query.state.data?.pending_jobs ? 15000 : false,
  })

  const connectMutation = useMutation({
    mutationFn: () =>
      googleCalendarApiCall(
        "/api/v1/calendar-integrations/google/connect",
        "POST",
      ) as Promise<{
        authorization_url: string
      }>,
    onSuccess: ({ authorization_url }) => {
      window.location.assign(authorization_url)
    },
    onError: (error: unknown) =>
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Could not connect Google Calendar",
      ),
  })

  const resyncMutation = useMutation({
    mutationFn: () =>
      googleCalendarApiCall(
        "/api/v1/calendar-integrations/google/resync",
        "POST",
      ) as Promise<{
        queued: number
      }>,
    onSuccess: ({ queued }) => {
      showSuccessToast(
        queued
          ? `${queued} calendar update(s) queued`
          : "Calendar is already up to date",
      )
      void queryClient.invalidateQueries({
        queryKey: ["google-calendar-integration"],
      })
    },
    onError: (error: unknown) =>
      showErrorToast(
        error instanceof Error ? error.message : "Could not resync calendar",
      ),
  })

  const disconnectMutation = useMutation({
    mutationFn: () =>
      googleCalendarApiCall(
        "/api/v1/calendar-integrations/google/connection",
        "DELETE",
      ),
    onSuccess: () => {
      showSuccessToast(
        "Google Calendar disconnected. Existing Google events were kept.",
      )
      void queryClient.invalidateQueries({
        queryKey: ["google-calendar-integration"],
      })
    },
    onError: (error: unknown) =>
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Could not disconnect Google Calendar",
      ),
  })

  const status = statusQuery.data
  const isBusy =
    connectMutation.isPending ||
    resyncMutation.isPending ||
    disconnectMutation.isPending
  const needsReconnect = status?.status === "reconnect_required"

  return (
    <section className="rounded-lg border border-[#e5e0dc] bg-white p-5 shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
            Google Calendar
          </h2>
          {statusQuery.isLoading ? (
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Checking connection...
            </p>
          ) : status?.connected ? (
            <div className="mt-1 space-y-1 text-sm text-[rgba(0,0,0,0.7)]">
              <p>
                Connected to the private{" "}
                {status.calendar_name || "Oak Hill Park"} calendar.
              </p>
              <p>
                Last sync: {formatDateTime(status.last_synced_at)}
                {status.pending_jobs
                  ? ` - ${status.pending_jobs} update(s) pending`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="mt-1 space-y-1 text-sm text-[rgba(0,0,0,0.7)]">
              <p>
                {needsReconnect
                  ? "Google needs authorization again to continue syncing."
                  : "Connect a private calendar for upcoming contractor services."}
              </p>
              {status?.last_error && (
                <p className="text-amber-700">{status.last_error}</p>
              )}
            </div>
          )}
          {statusQuery.isError && (
            <p className="mt-1 text-sm text-red-700">
              Could not read Google Calendar status.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!status?.connected && (
            <button
              type="button"
              onClick={() => connectMutation.mutate()}
              disabled={isBusy}
              className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connectMutation.isPending
                ? "Redirecting..."
                : needsReconnect
                  ? "Reconnect"
                  : "Connect"}
            </button>
          )}
          {status?.connected && (
            <>
              <div className="flex max-w-full items-center gap-2 rounded-lg border border-[#8c7569] py-1 pl-3 pr-1 text-sm font-semibold text-[#55311c]">
                {status.account_email ? (
                  <span
                    className="max-w-52 truncate sm:max-w-64"
                    title={status.account_email}
                  >
                    {status.account_email}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => connectMutation.mutate()}
                    disabled={isBusy}
                    className="max-w-52 truncate text-left hover:underline disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-64"
                  >
                    {connectMutation.isPending
                      ? "Redirecting..."
                      : "Reconnect to show Gmail"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => resyncMutation.mutate()}
                  disabled={isBusy}
                  title="Resync Google Calendar"
                  aria-label="Resync Google Calendar"
                  className="grid size-8 place-items-center rounded-md transition-colors hover:bg-[#e9e1db] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    className={resyncMutation.isPending ? "size-4 animate-spin" : "size-4"}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Disconnect Google Calendar? Existing Google events will be kept.",
                    )
                  ) {
                    disconnectMutation.mutate()
                  }
                }}
                disabled={isBusy}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
