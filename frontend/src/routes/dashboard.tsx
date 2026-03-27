import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import QRCode from "qrcode"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { OpenAPI } from "@/client"
import { ContractorHistoryContent } from "@/components/Admin/ContractorHistoryContent"
import { TasksBoard } from "@/components/Tasks/TasksBoard"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

type EntityId = string | number

interface ApiListResponse<T> {
  data: T[]
  count?: number
}

interface UserProfile {
  full_name?: string | null
  email?: string | null
  cargo?: number
  condominio_id?: EntityId | null
}

interface Building {
  id: EntityId
  nome: string
  reading_types: number
  electricity_sn?: string | null
  gas_sn?: string | null
  flats?: Flat[]
}

interface Flat {
  id: EntityId
  numero: number
  label?: string | null
  reading_types: number
  building?: Building
}

interface Reading {
  id: EntityId
  data: string
  tipo: number
  valor: number
}

interface Funcionario {
  id: EntityId
  cargo: number
  is_default?: boolean
  nome?: string
  email?: string | null
  mobile?: string | number | null
}

interface AcessRecord {
  id: EntityId
  data?: string | null
  operacao?: number
  building_id?: EntityId
  building_nome?: string
  funcionario_id?: EntityId
}

interface BinMissCollectionRecord {
  id: EntityId
  data: string
  miss_collection: boolean
  collection_type: "general" | "recycle"
  collection_status: "miss" | "late"
  building_id: EntityId
  building_nome: string
}

interface BinSessionRecord {
  id: EntityId
  status: boolean
  data: string
  operacao: number
  building_id: EntityId
  building_nome: string
  funcionario_id: EntityId
}

interface WorkTimeSessionRecord {
  id: EntityId
  status: boolean
  data: string
  operacao: number
  funcionario_id: EntityId
}

interface CaretakerRecordEditState {
  recordId: EntityId
  originalIso: string
  label: "Time IN" | "Time OUT"
  recordType: "work-time" | "bins"
}

interface CleanerRecordEditState {
  inRecordId: EntityId | null
  inOriginalIso: string | null
  outRecordId: EntityId | null
  outOriginalIso: string | null
}

interface Morador {
  id: EntityId
  cargo: number
  building_nome: string
  flat_numero: number
  flat_label?: string | null
  flat_id: EntityId
  nome: string
  email?: string | null
  mobile?: string | number | null
  car1?: string | null
  car2?: string | null
  car3?: string | null
  receives_flat_reading_sms: boolean
  receives_twilio_sms: boolean
  reading_types: number
}

interface ReminderItem {
  id: EntityId
  name: string
  schedule_unit: string
  schedule_mode: string
  interval_value?: number | null
  weekday_mask: number
  month_mask?: number | null
  is_active: boolean
  action_sms: boolean
  sms_to?: string | null
  sms_message?: string | null
  action_task: boolean
  task_title?: string | null
  task_description?: string | null
  last_triggered_on?: string | null
  updated_at: string
}

interface ReminderExecutionInfo {
  checked: number
  triggered: number
  sms_sent: number
  tasks_created: number
}

interface ContractorVisitAdmin {
  id: EntityId
  name: string
  company: string
  building_name: string
  job_description: string
  mobile: string
  extra_media_name?: string | null
  extra_media_data?: string | null
  in_at: string
  out_at?: string | null
  condominio_id: EntityId
}

interface ContractorMediaFormState {
  mediaName: string
  mediaData: string | null
}

type ReminderScheduleUnit = "day" | "week" | "month"
type ReminderScheduleMode = "interval" | "fixed"

type FireAlarmBuildingId =
  | "falcon_1_6"
  | "falcon_7_12"
  | "martlett"
  | "merlin"
  | "oak_lodge"
  | "northwood"

interface FireAlarmBuildingConfig {
  id: FireAlarmBuildingId
  label: string
  callPoints: string[]
  locations: string[]
  anchorCallPoint: string
}

interface FireAlarmLogRow {
  time: string
  actionRequired: boolean
  comment: string
}

type FireAlarmLogByDate = Record<string, Record<string, FireAlarmLogRow>>

interface FireAlarmExternalCertificate {
  id: EntityId
  condominio_id: EntityId
  certificate_date: string
  certificate_time: string
  company: string
  professional: string
  media_1_name?: string | null
  media_1_data?: string | null
  media_2_name?: string | null
  media_2_data?: string | null
  created_by_user_id: EntityId
  created_at: string
}

interface FireAlarmExternalCertificatesResponse {
  data: FireAlarmExternalCertificate[]
  count: number
}

interface FireAlarmExternalCertificateFormState {
  certificateDate: string
  certificateTime: string
  company: string
  professional: string
  media1Name: string
  media1Data: string | null
  media2Name: string
  media2Data: string | null
}

interface CertificateMediaPreviewState {
  fileName: string
  dataUrl: string
  subtitle: string
}

type ScheduleBuildingId = string

interface ScheduleBuildingEntry {
  buildingId: ScheduleBuildingId
  buildingLabel: string
}

type ResidentTypeFilter = "owner_1" | "owner_2" | "tenant" | "agent" | "all"

type FlatResidentRow = {
  key: string
  building_nome: string
  flat_numero: number
  flat_label?: string | null
  reading_types: number
  owner_1?: Morador
  owner_2?: Morador
  tenant?: Morador
  agent?: Morador
  edit_target_id: EntityId | null
}

type FlatResidentsPreview = {
  owner_1?: Morador
  owner_2?: Morador
  tenant?: Morador
  agent?: Morador
}

type FlatResidentPreviewEntry = {
  key: keyof FlatResidentsPreview
  label: string
  resident: Morador
}

type ResidentEditContext = {
  editTitle: string
  flatResidents?: FlatResidentsPreview
}

interface MoradorDetail {
  nome: string
  email?: string | null
  mobile?: string | number | null
  cargo: number
  car1?: string | null
  car2?: string | null
  car3?: string | null
  receives_flat_reading_sms: boolean
  receives_twilio_sms: boolean
  flat_id: EntityId
}

interface NotificationHistoryEntry {
  id: EntityId
  created_at: string
  notification_type: string
  recipient_to: string
  message: string
  delivery_status: string
  success: boolean
  provider_message_id?: string | null
  error_message?: string | null
}

interface NewReadingPayload {
  building_id?: EntityId
  flat_id?: EntityId
  tipo: number
  valor: number
  data?: string
}

const formatFlatNumber = (
  flatNumber?: number | null,
  flatLabel?: string | null,
) => {
  if (flatLabel?.trim()) return flatLabel.trim()
  if (flatNumber === null || flatNumber === undefined) return ""
  return String(flatNumber)
}

const formatFlatLabel = (
  flatNumber?: number | null,
  flatLabel?: string | null,
) => `Flat ${formatFlatNumber(flatNumber, flatLabel)}`

type ApiQueryParams = Record<
  string,
  string | number | boolean | null | undefined
>
type ApiRequestOptions = { method?: string; body?: unknown }

const isRequestOptions = (
  params?: ApiQueryParams | ApiRequestOptions,
): params is ApiRequestOptions => {
  if (!params || typeof params !== "object") return false
  return "method" in params || "body" in params
}

// Wrapper to call the API directly while the client is not regenerated
const apiCall = async (
  endpoint: string,
  params?: ApiQueryParams | ApiRequestOptions,
) => {
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

  const url = new URL(`${resolveApiBase()}${endpoint}`)
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
      Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      "Content-Type": "application/json",
    },
  }

  if (requestOptions?.body !== undefined) {
    const { body } = requestOptions
    options.body = typeof body === "string" ? body : JSON.stringify(body)
  }

  const response = await fetch(url.toString(), options)
  if (!response.ok) {
    let message = "API call failed"
    try {
      const payload = (await response.json()) as {
        detail?: string
        message?: string
      }
      message = payload.detail || payload.message || message
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  return response.json()
}

const formatDateToBr = (value: string) => {
  const datePart = value.includes("T") ? value.split("T")[0] : value
  const [y, m, d] = datePart.split("-")
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

const isDateWithinRange = (
  value: string,
  dateFrom?: string,
  dateTo?: string,
) => {
  const datePart = value.includes("T") ? value.split("T")[0] : value
  if (dateFrom && datePart < dateFrom) return false
  if (dateTo && datePart > dateTo) return false
  return true
}

const buildDateRangeLabel = (dateFrom?: string, dateTo?: string) => {
  if (dateFrom && dateTo)
    return `${formatDateToBr(dateFrom)} - ${formatDateToBr(dateTo)}`
  if (dateFrom) return `From ${formatDateToBr(dateFrom)}`
  if (dateTo) return `Until ${formatDateToBr(dateTo)}`
  return "All period"
}

const toIsoDateString = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getWeekStartIso = (value: string | Date) => {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const normalized = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  )
  const weekday = normalized.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  normalized.setDate(normalized.getDate() + offset)
  return toIsoDateString(normalized)
}

const addDaysToIso = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return isoDate
  date.setDate(date.getDate() + days)
  return toIsoDateString(date)
}

const addWeeksToIso = (isoDate: string, weeks: number) =>
  addDaysToIso(isoDate, weeks * 7)

const isIsoDateWithinWeek = (isoDate: string, weekStartIso: string) =>
  Boolean(isoDate) &&
  Boolean(weekStartIso) &&
  isoDate >= weekStartIso &&
  isoDate <= addDaysToIso(weekStartIso, 6)

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const buildReadingsReportEmailHtml = ({
  reportType,
  locationLabel,
  periodLabel,
}: {
  reportType: "Building" | "Flat"
  locationLabel: string
  periodLabel: string
}) => {
  const safeType = escapeHtml(reportType)
  const safeLocation = escapeHtml(locationLabel)
  const safePeriod = escapeHtml(periodLabel)

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#2f2f2f;line-height:1.5;">
    <h2 style="margin:0 0 12px;color:#55311c;">Hello,</h2>
    <p style="margin:0 0 10px;">
      Please find attached your readings report.
    </p>
    <p style="margin:0 0 6px;"><strong>Type:</strong> ${safeType}</p>
    <p style="margin:0 0 6px;"><strong>${safeType}:</strong> ${safeLocation}</p>
    <p style="margin:0 0 16px;"><strong>Period:</strong> ${safePeriod}</p>
    <p style="margin:0 0 8px;">
      If you have any questions, please reply to this email.
    </p>
    <p style="margin:0;color:#666;">OakHill Park Team</p>
  </div>
  `.trim()
}

const buildScheduleReportEmailHtml = ({
  scheduleName,
  periodLabel,
}: {
  scheduleName: string
  periodLabel: string
}) => {
  const safeSchedule = escapeHtml(scheduleName)
  const safePeriod = escapeHtml(periodLabel)

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#2f2f2f;line-height:1.5;">
    <h2 style="margin:0 0 12px;color:#55311c;">Hello,</h2>
    <p style="margin:0 0 10px;">
      Please find attached your report.
    </p>
    <p style="margin:0 0 6px;"><strong>Schedule:</strong> ${safeSchedule}</p>
    <p style="margin:0 0 16px;"><strong>Period:</strong> ${safePeriod}</p>
    <p style="margin:0 0 8px;">
      If you have any questions, please reply to this email.
    </p>
    <p style="margin:0;color:#666;">OakHill Park Team</p>
  </div>
  `.trim()
}

const buildWorkTimeReportEmailHtml = ({
  caretakerName,
  periodLabel,
}: {
  caretakerName: string
  periodLabel: string
}) => {
  const safeCaretakerName = escapeHtml(caretakerName)
  const safePeriod = escapeHtml(periodLabel)

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#2f2f2f;line-height:1.5;">
    <h2 style="margin:0 0 12px;color:#55311c;">Hello,</h2>
    <p style="margin:0 0 10px;">
      Please find attached the caretaker work time report.
    </p>
    <p style="margin:0 0 6px;"><strong>Caretaker:</strong> ${safeCaretakerName}</p>
    <p style="margin:0 0 16px;"><strong>Period:</strong> ${safePeriod}</p>
    <p style="margin:0 0 8px;">
      If you have any questions, please reply to this email.
    </p>
    <p style="margin:0;color:#666;">OakHill Park Team</p>
  </div>
  `.trim()
}

const weekdayOptions = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
]

const weekdayMaskFromList = (days: number[]) =>
  days.reduce((mask, day) => mask | (1 << day), 0)

const weekdayListFromMask = (mask: number) =>
  weekdayOptions
    .filter((option) => (mask & (1 << option.value)) !== 0)
    .map((option) => option.value)

const weekdayLabelsFromMask = (mask: number) =>
  weekdayOptions
    .filter((option) => (mask & (1 << option.value)) !== 0)
    .map((option) => option.label)

const monthOptions = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

const monthMaskFromList = (months: number[]) =>
  months.reduce((mask, month) => mask | (1 << (month - 1)), 0)

const monthListFromMask = (mask?: number | null) =>
  monthOptions
    .filter((option) =>
      Boolean(mask && (mask & (1 << (option.value - 1))) !== 0),
    )
    .map((option) => option.value)

const monthLabelsFromMask = (mask?: number | null) =>
  monthOptions
    .filter((option) =>
      Boolean(mask && (mask & (1 << (option.value - 1))) !== 0),
    )
    .map((option) => option.label)

const formatReminderSchedule = (reminder: {
  schedule_unit: string
  schedule_mode: string
  interval_value?: number | null
  weekday_mask: number
  month_mask?: number | null
}) => {
  if (reminder.schedule_unit === "day") {
    if (reminder.schedule_mode === "fixed") return "Every day"
    return `Every ${reminder.interval_value || 1} day(s)`
  }

  if (reminder.schedule_unit === "week") {
    const weekdayLabel = weekdayLabelsFromMask(reminder.weekday_mask).join(", ")
    if (reminder.schedule_mode === "fixed") return weekdayLabel || "Every week"
    return `Every ${reminder.interval_value || 1} week(s)`
  }

  if (reminder.schedule_unit === "month") {
    if (reminder.schedule_mode === "fixed") {
      const monthLabel = monthLabelsFromMask(reminder.month_mask).join(", ")
      return monthLabel
        ? `${monthLabel} on the first day of the month`
        : "Selected months on the first day"
    }
    return `Every ${reminder.interval_value || 1} month(s) on the first day`
  }

  return "Custom schedule"
}

const REMINDS_EXECUTE_DUE_LAST_RUN_KEY = "ohp_reminds_execute_due_last_run_v1"
const REMINDS_EXECUTE_DUE_COOLDOWN_MS = 60 * 1000
const CONTRACTOR_HISTORY_EXECUTE_DUE_LAST_RUN_KEY =
  "ohp_contractor_history_execute_due_last_run_v1"
const CONTRACTOR_HISTORY_EXECUTE_DUE_COOLDOWN_MS = 60 * 1000

const FIRE_ALARM_ANCHOR_DATE = "2026-02-26"
const FIRE_ALARM_ANCHOR_REPETITION = 14
const FIRE_ALARM_STORAGE_KEY = "ohp_fire_alarm_schedule_v1"
const LIFT_SCHEDULE_STORAGE_KEY = "ohp_lift_schedule_v1"
const LIGHT_SCHEDULE_STORAGE_KEY = "ohp_emergency_light_schedule_v1"
const FIRE_ALARM_ANCHOR_CALL_POINTS: Record<FireAlarmBuildingId, string> = {
  falcon_1_6: "014",
  falcon_7_12: "014",
  martlett: "055",
  merlin: "020",
  oak_lodge: "063",
  northwood: "021",
}

const FIRE_ALARM_INITIAL_LOGS: FireAlarmLogByDate = {
  "2026-02-19": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2026-02-12": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2026-02-05": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2026-01-29": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2026-01-22": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2026-01-15": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2026-01-08": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-12-18": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-12-11": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-12-04": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-11-27": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2025-11-20": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2025-11-13": {
    falcon_1_6: { time: "11:20", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:30", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "11:50", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:00", actionRequired: false, comment: "" },
    northwood: { time: "12:10", actionRequired: false, comment: "" },
  },
  "2025-11-06": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-10-30": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-05-22": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: {
      time: "11:40",
      actionRequired: true,
      comment: "Device P4/L1 064 Faulty",
    },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2025-05-15": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2025-05-08": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-05-01": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-04-24": {
    falcon_1_6: { time: "12:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "12:10", actionRequired: false, comment: "" },
    martlett: { time: "12:20", actionRequired: false, comment: "" },
    merlin: { time: "12:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:40", actionRequired: false, comment: "" },
    northwood: { time: "12:50", actionRequired: false, comment: "" },
  },
  "2025-04-17": {
    falcon_1_6: { time: "11:20", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:30", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "11:50", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:00", actionRequired: false, comment: "" },
    northwood: { time: "12:10", actionRequired: false, comment: "" },
  },
  "2025-04-10": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2025-04-03": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2025-03-27": {
    falcon_1_6: { time: "11:20", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:30", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "11:50", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:00", actionRequired: false, comment: "" },
    northwood: { time: "12:10", actionRequired: false, comment: "" },
  },
  "2025-03-20": {
    falcon_1_6: { time: "13:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "13:10", actionRequired: false, comment: "" },
    martlett: { time: "13:20", actionRequired: false, comment: "" },
    merlin: { time: "13:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "13:40", actionRequired: false, comment: "" },
    northwood: { time: "13:50", actionRequired: false, comment: "" },
  },
  "2025-03-13": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-03-06": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-02-27": {
    falcon_1_6: { time: "11:20", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:30", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "11:50", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:00", actionRequired: false, comment: "" },
    northwood: { time: "12:10", actionRequired: false, comment: "" },
  },
  "2025-02-20": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:40", actionRequired: false, comment: "" },
  },
  "2025-02-13": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2025-02-06": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-02-01": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2025-01-30": {
    falcon_1_6: { time: "11:40", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:50", actionRequired: false, comment: "" },
    martlett: { time: "12:00", actionRequired: false, comment: "" },
    merlin: { time: "12:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:20", actionRequired: false, comment: "" },
    northwood: { time: "12:30", actionRequired: false, comment: "" },
  },
  "2025-01-23": {
    falcon_1_6: { time: "11:20", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:30", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "11:50", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:00", actionRequired: false, comment: "" },
    northwood: { time: "12:10", actionRequired: false, comment: "" },
  },
  "2025-01-16": {
    falcon_1_6: { time: "11:40", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:50", actionRequired: false, comment: "" },
    martlett: { time: "12:00", actionRequired: false, comment: "" },
    merlin: { time: "12:15", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:25", actionRequired: false, comment: "" },
    northwood: { time: "12:35", actionRequired: false, comment: "" },
  },
  "2025-01-09": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2024-12-26": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:25", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2024-12-19": {
    falcon_1_6: { time: "11:30", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:40", actionRequired: false, comment: "" },
    martlett: { time: "11:50", actionRequired: false, comment: "" },
    merlin: { time: "12:00", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:10", actionRequired: false, comment: "" },
    northwood: { time: "12:20", actionRequired: false, comment: "" },
  },
  "2024-12-12": {
    falcon_1_6: { time: "11:40", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:50", actionRequired: false, comment: "" },
    martlett: { time: "12:00", actionRequired: false, comment: "" },
    merlin: { time: "12:15", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:25", actionRequired: false, comment: "" },
    northwood: { time: "12:35", actionRequired: false, comment: "" },
  },
  "2024-12-05": {
    falcon_1_6: { time: "11:30", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:40", actionRequired: false, comment: "" },
    martlett: { time: "11:50", actionRequired: false, comment: "" },
    merlin: { time: "12:00", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:15", actionRequired: false, comment: "" },
    northwood: { time: "12:25", actionRequired: false, comment: "" },
  },
  "2024-11-28": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:35", actionRequired: false, comment: "" },
    merlin: { time: "11:45", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:55", actionRequired: false, comment: "" },
    northwood: { time: "12:10", actionRequired: false, comment: "" },
  },
  "2024-11-21": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:30", actionRequired: false, comment: "" },
    merlin: { time: "11:40", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:50", actionRequired: false, comment: "" },
    northwood: { time: "12:00", actionRequired: false, comment: "" },
  },
  "2024-11-14": {
    falcon_1_6: { time: "11:10", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:25", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "11:50", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:10", actionRequired: false, comment: "" },
    northwood: { time: "12:20", actionRequired: false, comment: "" },
  },
  "2024-11-07": {
    falcon_1_6: { time: "11:40", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:50", actionRequired: false, comment: "" },
    martlett: { time: "12:30", actionRequired: false, comment: "" },
    merlin: { time: "12:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:15", actionRequired: false, comment: "" },
    northwood: { time: "12:20", actionRequired: false, comment: "" },
  },
  "2024-10-31": {
    falcon_1_6: { time: "11:30", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:40", actionRequired: false, comment: "" },
    martlett: { time: "11:50", actionRequired: false, comment: "" },
    merlin: { time: "12:00", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:10", actionRequired: false, comment: "" },
    northwood: { time: "12:20", actionRequired: false, comment: "" },
  },
  "2024-10-24": {
    falcon_1_6: { time: "11:40", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:50", actionRequired: false, comment: "" },
    martlett: { time: "12:00", actionRequired: false, comment: "" },
    merlin: { time: "12:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:20", actionRequired: false, comment: "" },
    northwood: { time: "12:30", actionRequired: false, comment: "" },
  },
  "2024-10-17": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2024-10-10": {
    falcon_1_6: { time: "11:20", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:30", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "11:50", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:00", actionRequired: false, comment: "" },
    northwood: { time: "12:10", actionRequired: false, comment: "" },
  },
  "2024-10-03": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "11:20", actionRequired: false, comment: "" },
    merlin: { time: "11:30", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:40", actionRequired: false, comment: "" },
    northwood: { time: "11:50", actionRequired: false, comment: "" },
  },
  "2024-09-26": {
    falcon_1_6: { time: "11:30", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:40", actionRequired: false, comment: "" },
    martlett: { time: "11:50", actionRequired: false, comment: "" },
    merlin: { time: "12:00", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:10", actionRequired: false, comment: "" },
    northwood: { time: "12:20", actionRequired: false, comment: "" },
  },
  "2024-09-19": {
    falcon_1_6: { time: "11:40", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:50", actionRequired: false, comment: "" },
    martlett: { time: "12:00", actionRequired: false, comment: "" },
    merlin: { time: "12:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:20", actionRequired: false, comment: "" },
    northwood: { time: "12:30", actionRequired: false, comment: "" },
  },
}

const LIFT_SCHEDULE_INITIAL_LOGS: FireAlarmLogByDate = {
  "2025-02-01": {
    falcon_1_6: { time: "", actionRequired: false, comment: "" },
    falcon_7_12: { time: "", actionRequired: false, comment: "" },
    martlett: { time: "11:00", actionRequired: false, comment: "" },
    merlin: { time: "11:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:20", actionRequired: false, comment: "" },
    northwood: { time: "", actionRequired: false, comment: "" },
  },
  "2025-01-01": {
    falcon_1_6: { time: "", actionRequired: false, comment: "" },
    falcon_7_12: { time: "", actionRequired: false, comment: "" },
    martlett: { time: "11:00", actionRequired: false, comment: "" },
    merlin: { time: "11:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "11:20", actionRequired: false, comment: "" },
    northwood: { time: "", actionRequired: false, comment: "" },
  },
}

const LIGHT_SCHEDULE_INITIAL_LOGS: FireAlarmLogByDate = {
  "2025-06-03": {
    falcon_1_6: { time: "12:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "12:20", actionRequired: false, comment: "" },
    martlett: { time: "12:50", actionRequired: false, comment: "" },
    merlin: { time: "13:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "13:30", actionRequired: false, comment: "" },
    northwood: { time: "14:00", actionRequired: false, comment: "" },
  },
  "2025-05-03": {
    falcon_1_6: { time: "11:20", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:40", actionRequired: false, comment: "" },
    martlett: { time: "12:00", actionRequired: false, comment: "" },
    merlin: { time: "12:20", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:40", actionRequired: false, comment: "" },
    northwood: { time: "13:00", actionRequired: false, comment: "" },
  },
  "2025-04-03": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:20", actionRequired: false, comment: "" },
    martlett: { time: "11:40", actionRequired: false, comment: "" },
    merlin: { time: "12:00", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:20", actionRequired: false, comment: "" },
    northwood: { time: "12:40", actionRequired: false, comment: "" },
  },
  "2025-03-03": {
    falcon_1_6: { time: "11:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "11:10", actionRequired: false, comment: "" },
    martlett: { time: "12:00", actionRequired: false, comment: "" },
    merlin: { time: "12:10", actionRequired: false, comment: "" },
    oak_lodge: { time: "12:30", actionRequired: false, comment: "" },
    northwood: { time: "13:00", actionRequired: false, comment: "" },
  },
  "2025-02-03": {
    falcon_1_6: { time: "12:00", actionRequired: false, comment: "" },
    falcon_7_12: { time: "12:20", actionRequired: false, comment: "" },
    martlett: { time: "12:50", actionRequired: false, comment: "" },
    merlin: { time: "13:20", actionRequired: false, comment: "" },
    oak_lodge: { time: "13:45", actionRequired: false, comment: "" },
    northwood: { time: "14:00", actionRequired: false, comment: "" },
  },
}

const mergeLogsWithInitialSeed = (
  logs: FireAlarmLogByDate,
  initialSeed: FireAlarmLogByDate,
) => {
  const merged: FireAlarmLogByDate = { ...logs }
  Object.entries(initialSeed).forEach(([date, seedRows]) => {
    merged[date] = {
      ...seedRows,
      ...(merged[date] || {}),
    }
  })
  return merged
}

const mergeFireAlarmLogsWithInitialSeed = (logs: FireAlarmLogByDate) =>
  mergeLogsWithInitialSeed(logs, FIRE_ALARM_INITIAL_LOGS)

const createEmptyLogRow = (): FireAlarmLogRow => ({
  time: "",
  actionRequired: false,
  comment: "",
})

const LIGHT_MARTLETT_SPLIT_BUILDINGS: ScheduleBuildingEntry[] = [
  { buildingId: "martlett_1_6", buildingLabel: "Martlett 1-6" },
  { buildingId: "martlett_7_9", buildingLabel: "Martlett 7-9" },
  { buildingId: "martlett_10_12", buildingLabel: "Martlett 10-12" },
  { buildingId: "martlett_13_16", buildingLabel: "Martlett 13-16" },
]

const normalizeLightScheduleRows = (
  rowMap: Record<string, FireAlarmLogRow> | undefined,
) => {
  const normalized = { ...(rowMap || {}) }
  const legacyMartlett = normalized.martlett
  LIGHT_MARTLETT_SPLIT_BUILDINGS.forEach((entry) => {
    if (!normalized[entry.buildingId]) {
      normalized[entry.buildingId] = legacyMartlett
        ? { ...legacyMartlett }
        : createEmptyLogRow()
    }
  })
  return normalized
}

const normalizeLightScheduleLogs = (logs: FireAlarmLogByDate) => {
  const normalized: FireAlarmLogByDate = {}
  Object.entries(logs).forEach(([date, rowMap]) => {
    normalized[date] = normalizeLightScheduleRows(rowMap)
  })
  return normalized
}

const getInitialLogsByScheduleId = (
  scheduleId: "lift" | "light",
): FireAlarmLogByDate =>
  scheduleId === "lift"
    ? LIFT_SCHEDULE_INITIAL_LOGS
    : normalizeLightScheduleLogs(LIGHT_SCHEDULE_INITIAL_LOGS)

const FIRE_ALARM_BUILDINGS: FireAlarmBuildingConfig[] = [
  {
    id: "falcon_1_6",
    label: "Falcon 1-6",
    callPoints: ["003", "014", "021"],
    locations: ["GF", "1F", "2F"],
    anchorCallPoint: "014",
  },
  {
    id: "falcon_7_12",
    label: "Falcon 7-12",
    callPoints: ["003", "014", "021"],
    locations: ["GF", "1F", "2F"],
    anchorCallPoint: "014",
  },
  {
    id: "martlett",
    label: "Martlett",
    callPoints: [
      "007",
      "019",
      "026",
      "032",
      "039",
      "044",
      "048",
      "055",
      "060",
      "064",
      "071",
      "076",
    ],
    locations: [
      "GF | 1-6",
      "1F | 1-6",
      "2F | 1-6",
      "GF | 7-9",
      "1F | 7-9",
      "2F | 7-9",
      "GF | 10-12",
      "1F | 10-12",
      "2F | 10-12",
      "GF | 13-16",
      "1F | 13-16",
      "2F | 13-16",
    ],
    anchorCallPoint: "055",
  },
  {
    id: "merlin",
    label: "Merlin",
    callPoints: [
      "009",
      "025",
      "033",
      "041",
      "049",
      "057",
      "063",
      "020",
      "008",
      "016",
      "026",
      "034",
      "042",
      "050",
      "058",
      "064",
    ],
    locations: [
      "GF",
      "1F",
      "2F",
      "3F",
      "4F",
      "5F",
      "6F",
      "BOILER",
      "LIFT ROOM",
      "GF REAR",
      "1F REAR",
      "2F REAR",
      "3F REAR",
      "4F REAR",
      "5F REAR",
      "6F REAR",
    ],
    anchorCallPoint: "020",
  },
  {
    id: "oak_lodge",
    label: "Oak Lodge",
    callPoints: [
      "026",
      "039",
      "047",
      "055",
      "063",
      "071",
      "079",
      "012",
      "009",
      "031",
      "023",
      "L1/40",
      "048",
      "056",
      "064",
      "072",
      "080",
    ],
    locations: [
      "GF",
      "1F",
      "2F",
      "3F",
      "4F",
      "5F",
      "6F",
      "BOILER",
      "LIFT ROOM",
      "GF REAR",
      "Garage",
      "1F REAR",
      "2F REAR",
      "3F REAR",
      "4F REAR",
      "5F REAR",
      "6F REAR",
    ],
    anchorCallPoint: "063",
  },
  {
    id: "northwood",
    label: "NorthWood",
    callPoints: [
      "013",
      "029",
      "037",
      "045",
      "053",
      "061",
      "069",
      "021",
      "008",
      "020",
      "030",
      "038",
      "046",
      "054",
      "062",
      "070",
    ],
    locations: [
      "GF",
      "1F",
      "2F",
      "3F",
      "4F",
      "5F",
      "6F",
      "BOILER",
      "LIFT BASEMENT",
      "GF REAR",
      "1F REAR",
      "2F REAR",
      "3F REAR",
      "4F REAR",
      "5F REAR",
      "6F REAR",
    ],
    anchorCallPoint: "021",
  },
]

const LIFT_UNAVAILABLE_BUILDINGS = new Set<FireAlarmBuildingId>([
  "falcon_1_6",
  "falcon_7_12",
  "martlett",
])

const LIGHT_SCHEDULE_BUILDINGS: ScheduleBuildingEntry[] = [
  { buildingId: "falcon_1_6", buildingLabel: "Falcon 1-6" },
  { buildingId: "falcon_7_12", buildingLabel: "Falcon 7-12" },
  ...LIGHT_MARTLETT_SPLIT_BUILDINGS,
  { buildingId: "merlin", buildingLabel: "Merlin" },
  { buildingId: "oak_lodge", buildingLabel: "Oak Lodge" },
  { buildingId: "northwood", buildingLabel: "NorthWood" },
]

const getBuildingsForSchedule = (
  scheduleId: "lift" | "light",
): ScheduleBuildingEntry[] => {
  if (scheduleId === "light") {
    return LIGHT_SCHEDULE_BUILDINGS
  }
  return FIRE_ALARM_BUILDINGS.filter(
    (building) => !LIFT_UNAVAILABLE_BUILDINGS.has(building.id),
  ).map((building) => ({
    buildingId: building.id,
    buildingLabel: building.label,
  }))
}

const getDefaultRowsForSchedule = (scheduleId: "lift" | "light") => {
  const rows: Record<string, FireAlarmLogRow> = {}
  getBuildingsForSchedule(scheduleId).forEach((entry) => {
    rows[entry.buildingId] = createEmptyLogRow()
  })
  return rows
}

const hasLogRowContent = (row?: FireAlarmLogRow) =>
  Boolean(row && (row.time.trim() || row.actionRequired || row.comment.trim()))

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const toTimeInputValue = (dateValue?: string | null) => {
  if (!dateValue) return ""
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ""
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

const formatDateToGb = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-")
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}

const readFileAsDataUrl = async (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read media"))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(new Error("Could not read media"))
    reader.readAsDataURL(file)
  })

const isImageDataUrl = (value?: string | null) =>
  typeof value === "string" && value.startsWith("data:image/")

const getDataUrlMimeType = (value?: string | null) => {
  if (typeof value !== "string") return null
  const match = value.match(/^data:([^;]+);base64,/i)
  return match?.[1]?.toLowerCase() || null
}

const isPdfDataUrl = (value?: string | null) =>
  getDataUrlMimeType(value) === "application/pdf"

const getEmptyFireAlarmExternalCertificateForm =
  (): FireAlarmExternalCertificateFormState => ({
    certificateDate: toDateInputValue(),
    certificateTime: "",
    company: "",
    professional: "",
    media1Name: "",
    media1Data: null,
    media2Name: "",
    media2Data: null,
  })

const parseIsoDateToUtc = (isoDate: string) => {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!year || !month || !day) return Number.NaN
  return Date.UTC(year, month - 1, day)
}

const positiveModulo = (value: number, mod: number) =>
  ((value % mod) + mod) % mod

const normalizeCallPoint = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/^0+(\d)/, "$1")

const getFireAlarmRepetition = (isoDate: string) => {
  const current = parseIsoDateToUtc(isoDate)
  const anchor = parseIsoDateToUtc(FIRE_ALARM_ANCHOR_DATE)
  if (Number.isNaN(current) || Number.isNaN(anchor))
    return FIRE_ALARM_ANCHOR_REPETITION
  const diffDays = Math.floor((current - anchor) / (24 * 60 * 60 * 1000))
  const diffWeeks = Math.floor(diffDays / 7)
  return FIRE_ALARM_ANCHOR_REPETITION + diffWeeks
}

const getCallPointIndex = (callPoints: string[], anchorCallPoint: string) => {
  const anchorNormalized = normalizeCallPoint(anchorCallPoint)
  const index = callPoints.findIndex(
    (callPoint) => normalizeCallPoint(callPoint) === anchorNormalized,
  )
  return index >= 0 ? index : 0
}

const getFireAlarmScheduleRowsForDate = (isoDate: string) => {
  const repetition = getFireAlarmRepetition(isoDate)
  const offset = repetition - FIRE_ALARM_ANCHOR_REPETITION
  return FIRE_ALARM_BUILDINGS.map((building) => {
    const anchorCallPoint =
      FIRE_ALARM_ANCHOR_CALL_POINTS[building.id] || building.anchorCallPoint
    const anchorIndex = getCallPointIndex(building.callPoints, anchorCallPoint)
    const currentIndex = positiveModulo(
      anchorIndex + offset,
      building.callPoints.length,
    )
    const callPoint = building.callPoints[currentIndex]
    const location =
      building.locations[
        positiveModulo(currentIndex, building.locations.length)
      ]
    return {
      buildingId: building.id,
      buildingLabel: building.label,
      callPoint,
      location,
      repetition,
    }
  })
}

const getDefaultFireAlarmRows = (): Record<
  FireAlarmBuildingId,
  FireAlarmLogRow
> => ({
  falcon_1_6: { time: "", actionRequired: false, comment: "" },
  falcon_7_12: { time: "", actionRequired: false, comment: "" },
  martlett: { time: "", actionRequired: false, comment: "" },
  merlin: { time: "", actionRequired: false, comment: "" },
  oak_lodge: { time: "", actionRequired: false, comment: "" },
  northwood: { time: "", actionRequired: false, comment: "" },
})

const generatePdfTableReportBase64 = ({
  title,
  dateRange,
  headers,
  rows,
}: {
  title: string
  dateRange: string
  headers: string[]
  rows: (string | number)[][]
}) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  doc.setFontSize(14)
  doc.text(title, 40, 34)
  doc.setFontSize(10)
  doc.text(`Period: ${dateRange}`, 40, 52)
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, 40, 66)

  autoTable(doc, {
    startY: 80,
    head: [headers],
    body: rows,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 4,
      lineColor: [180, 180, 180],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [45, 134, 89],
      textColor: 255,
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [40, 40, 40],
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  })

  return doc.output("datauristring").split(",")[1] || ""
}

export const Route = createFileRoute("/dashboard")({
  component: ClientDashboard,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Dashboard - OakHill Park",
      },
    ],
  }),
})

function ClientDashboard() {
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {
      readings: true,
      qrCodes: true,
      schedule: true,
    },
  )

  useEffect(() => {
    if (!user || ((user.cargo ?? 0) < 2 && !user.is_superuser)) {
      return
    }

    let isCancelled = false

    const executeDueHistoryNotifications = async () => {
      try {
        const now = Date.now()
        const rawLastRun = localStorage.getItem(
          CONTRACTOR_HISTORY_EXECUTE_DUE_LAST_RUN_KEY,
        )
        const lastRun = rawLastRun ? Number(rawLastRun) : 0
        if (
          Number.isFinite(lastRun) &&
          now - lastRun < CONTRACTOR_HISTORY_EXECUTE_DUE_COOLDOWN_MS
        ) {
          return
        }
        localStorage.setItem(
          CONTRACTOR_HISTORY_EXECUTE_DUE_LAST_RUN_KEY,
          String(now),
        )
      } catch {
        // Ignore storage issues and still try the background check below.
      }

      try {
        const result = (await apiCall(
          "/api/v1/contractor-access/history/execute-due",
          {
            method: "POST",
          },
        )) as { triggered?: number }

        if (!isCancelled && (result.triggered || 0) > 0) {
          queryClient.invalidateQueries({
            queryKey: ["contractor-history-records"],
          })
        }
      } catch {
        // Background notification execution should stay silent on the dashboard.
      }
    }

    void executeDueHistoryNotifications()

    return () => {
      isCancelled = true
    }
  }, [queryClient, user])

  // Check if the user is manager/admin (role >= 2) for this dashboard
  if (!user || ((user.cargo ?? 0) < 2 && !user.is_superuser)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f1ee]">
        <div className="rounded-lg bg-white p-8 text-center shadow-lg">
          <h1 className="mb-4 text-2xl font-bold text-[#55311c]">
            Access Denied
          </h1>
          <p className="mb-6 text-[rgba(0,0,0,0.7)]">
            This area is restricted to managers and administrators.
          </p>
          <button
            onClick={logout}
            className="rounded bg-[#8c7569] px-6 py-2 text-white transition-all duration-300 hover:bg-[#55311c]"
            type="button"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }))
  }

  const isTabActive = (targetTab: string) =>
    activeTab === targetTab || activeTab === `${targetTab}-add`

  const menuGroups = [
    {
      name: "Readings",
      id: "readings",
      items: [
        { label: "Buildings", id: "buildings" },
        { label: "Flats", id: "flats" },
      ],
    },
    {
      name: "QR Codes",
      id: "qrCodes",
      items: [
        { label: "Cleaner", id: "qr-cleaner" },
        { label: "Contractor", id: "qr-contractor" },
        { label: "Caretaker", id: "qr-caretaker" },
        { label: "Bin Report", id: "qr-bins" },
      ],
    },
    {
      name: "Schedule",
      id: "schedule",
      items: [
        { label: "Alarm schedule", id: "schedule-alarm" },
        { label: "Lift schedule", id: "schedule-lift" },
        { label: "Emergency light", id: "schedule-light" },
      ],
    },
  ]

  const standaloneItems = [
    { label: "Tasks", id: "tasks" },
    { label: "Reminders", id: "reminds" },
    { label: "Residents", id: "residents" },
    { label: "Contractors", id: "contractors" },
    { label: "History", id: "history" },
    { label: "Cleaner", id: "cleaner" },
    { label: "Caretaker", id: "caretaker" },
    { label: "Bins", id: "bins" },
    { label: "Twilio", id: "twillio" },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewContent user={user} onNavigate={setActiveTab} />
      case "buildings":
        return <BuildingsReadingsContent />
      case "buildings-add":
        return <BuildingsReadingsContent initialShowForm />
      case "flats":
        return <FlatsReadingsContent />
      case "flats-add":
        return <FlatsReadingsContent initialShowForm />
      case "qr-cleaner":
        return <CleanerQrCodesContent />
      case "qr-contractor":
        return <ContractorQrCodesContent />
      case "qr-caretaker":
        return <CaretakerQrCodesContent />
      case "qr-bins":
        return <BinsQrCodesContent />
      case "schedule-alarm":
        return <CaretakerSchedules initialTab="alarm" />
      case "schedule-lift":
        return <CaretakerSchedules initialTab="lift" />
      case "schedule-light":
        return <CaretakerSchedules initialTab="light" />
      case "residents":
        return <ResidentsContent />
      case "contractors":
        return <ContractorsContent />
      case "history":
        return <ContractorHistoryContent />
      case "tasks":
        return <TasksBoard mode="manager" />
      case "reminds":
        return <RemindsContent />
      case "cleaner":
        return <CleanerContent />
      case "caretaker":
        return <CaretakerContent />
      case "bins":
        return <BinsContent />
      case "twillio":
        return <TwilioContent />
      default:
        return <OverviewContent user={user} onNavigate={setActiveTab} />
    }
  }

  return (
    <div className="dashboard-mobile-root flex min-h-screen bg-[#f5f1ee]">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-white shadow-lg transition-all duration-300 ease-in-out ${
          sidebarOpen ? "w-64" : "w-0"
        } z-40 overflow-hidden`}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar Header */}
          <div className="border-b border-[#ddd] px-6 py-4">
            <h2 className="font-['Nunito',sans-serif] text-lg font-bold text-[#55311c]">
              Menu
            </h2>
          </div>

          {/* Sidebar Content */}
          <nav className="flex-1 overflow-y-auto px-4 py-6">
            {/* Overview */}
            <button
              onClick={() => {
                setActiveTab("overview")
                setSidebarOpen(false)
              }}
              type="button"
              className={`mb-2 w-full rounded-lg px-4 py-2 text-left font-['Nunito',sans-serif] text-sm font-semibold transition-all duration-200 ${
                activeTab === "overview"
                  ? "bg-[#8c7569] text-white"
                  : "text-[#55311c] hover:bg-[#f9f7f5]"
              }`}
            >
              Overview
            </button>

            {/* Group Menu Items */}
            {menuGroups.map((group) => (
              <div key={group.id} className="mb-4">
                <button
                  onClick={() => toggleGroup(group.id)}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c] hover:bg-[#f9f7f5]"
                >
                  <span>{group.name}</span>
                  <svg
                    className={`h-4 w-4 transition-transform duration-200 ${
                      expandedGroups[group.id] ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Toggle group</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                </button>

                {/* Group Items */}
                {expandedGroups[group.id] && (
                  <div className="mt-2 space-y-1 pl-4">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id)
                          setSidebarOpen(false)
                        }}
                        type="button"
                        className={`block w-full rounded-lg px-4 py-2 text-left font-['Nunito',sans-serif] text-sm transition-all duration-200 ${
                          isTabActive(item.id)
                            ? "bg-[#8c7569] text-white"
                            : "text-[rgba(85,49,28,0.7)] hover:bg-[#f9f7f5]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Divider */}
            <div className="my-4 border-t border-[#ddd]" />

            {/* Standalone Items */}
            <div className="space-y-2">
              {standaloneItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id)
                    setSidebarOpen(false)
                  }}
                  type="button"
                  className={`w-full rounded-lg px-4 py-2 text-left font-['Nunito',sans-serif] text-sm font-semibold transition-all duration-200 ${
                    isTabActive(item.id)
                      ? "bg-[#8c7569] text-white"
                      : "text-[#55311c] hover:bg-[#f9f7f5]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="bg-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
            {/* Left: Menu Button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg bg-[#8c7569] p-2 text-white transition-all duration-300 hover:bg-[#55311c]"
              type="button"
              aria-label="Toggle menu"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>Menu</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            {/* Center: Logo and Title */}
            <div className="order-3 flex w-full items-center justify-center gap-3 sm:order-2 sm:w-auto sm:flex-1">
              <h1 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c] sm:text-2xl">
                OakHill Park
              </h1>
            </div>

            {/* Right: User Info and Logout */}
            <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:gap-4">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-[#55311c]">
                  {user?.full_name || "Manager"}
                </p>
                <p className="text-xs text-[rgba(0,0,0,0.6)]">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="rounded bg-[#8c7569] px-3 py-2 font-['Nunito',sans-serif] text-xs text-white transition-all duration-300 hover:bg-[#55311c] sm:px-4 sm:text-sm"
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto px-3 py-4 sm:px-6 sm:py-8">
          {renderContent()}
        </main>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

function OverviewContent({
  user,
  onNavigate,
}: {
  user: UserProfile
  onNavigate: (tabId: string) => void
}) {
  return (
    <div className="mx-auto max-w-7xl">
      {/* Welcome Section */}
      <div className="mb-8 rounded-lg bg-white p-8 shadow-md">
        <h2 className="mb-2 font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          Welcome, {user?.full_name || "Manager"}!
        </h2>
        <p className="text-[rgba(0,0,0,0.7)]">
          Manage all condo operations in one place.
        </p>
      </div>

      {/* Shortcut Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate("buildings-add")}
          className="rounded-lg bg-white p-6 text-left shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-['Nunito',sans-serif] text-sm font-semibold uppercase tracking-wide text-[#8c7569]">
              Shortcut
            </h3>
            <svg
              className="h-8 w-8 text-[#8c7569]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Add Readings</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
          <p className="text-3xl font-bold text-[#55311c]">Add Readings</p>
          <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">
            Open the buildings readings screen and add new readings.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("flats-add")}
          className="rounded-lg bg-white p-6 text-left shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-['Nunito',sans-serif] text-sm font-semibold uppercase tracking-wide text-[#8c7569]">
              Shortcut
            </h3>
            <svg
              className="h-8 w-8 text-[#8c7569]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Add Flat Readings</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 7h16M7 4v16m10-10v10M9 20h6"
              />
            </svg>
          </div>
          <p className="text-3xl font-bold text-[#55311c]">Add Flat Readings</p>
          <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">
            Open the flats readings screen and add new flat readings.
          </p>
        </button>
      </div>
    </div>
  )
}

function BuildingsReadingsContent({
  initialShowForm = false,
}: {
  initialShowForm?: boolean
}) {
  const [selectedBuildingId, setSelectedBuildingId] = useState<EntityId | null>(
    null,
  )
  const [showForm, setShowForm] = useState(initialShowForm)
  const [reportTrigger, setReportTrigger] = useState(0)

  const {
    data: buildingsData,
    isLoading: buildingsLoading,
    error: buildingsError,
  } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = buildingsData?.data || []

  // Set first building as selected if available
  const firstBuildingId = buildings[0]?.id

  useEffect(() => {
    if (firstBuildingId !== undefined && !selectedBuildingId) {
      setSelectedBuildingId(firstBuildingId)
    }
  }, [firstBuildingId, selectedBuildingId])

  useEffect(() => {
    if (initialShowForm) {
      setShowForm(true)
    }
  }, [initialShowForm])

  if (buildingsLoading) {
    return (
      <div className="mx-auto max-w-[125rem]">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Loading buildings...</p>
        </div>
      </div>
    )
  }

  if (buildingsError || !buildings.length) {
    return (
      <div className="mx-auto max-w-[110rem]">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">No building found</p>
        </div>
      </div>
    )
  }

  const selectedBuilding = buildings.find(
    (building) => building.id === selectedBuildingId,
  )

  if (showForm) {
    return (
      <AddReadingsForm
        buildings={buildings}
        onBack={() => setShowForm(false)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[125rem]">
      <div className="rounded-lg bg-white p-4 shadow-md sm:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Buildings - Readings
          </h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setReportTrigger((current) => current + 1)}
              disabled={!selectedBuilding}
              className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              Generate report
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c] sm:w-auto"
              type="button"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>Add reading</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Reading
            </button>
          </div>
        </div>

        {/* Building Navigation */}
        <div className="mb-6">
          <p className="block font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c] mb-3">
            Select a building:
          </p>
          <div className="w-full overflow-x-auto pb-1">
            <div className="flex min-w-max gap-3">
              {[...buildings]
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map((building) => (
                  <button
                    key={building.id}
                    onClick={() => setSelectedBuildingId(building.id)}
                    className={`rounded-lg px-5 py-2.5 font-['Nunito',sans-serif] font-semibold whitespace-nowrap transition-all duration-200 ${
                      selectedBuildingId === building.id
                        ? "bg-[#55311c] text-white shadow-lg"
                        : "bg-[#e8e4e1] text-[#55311c] hover:bg-[#ddd8d5]"
                    }`}
                    type="button"
                  >
                    {building.nome}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {selectedBuilding && (
          <BuildingReadingsTable
            building={selectedBuilding}
            reportTrigger={reportTrigger}
            onPrevious={() => {
              const currentIndex = buildings.findIndex(
                (building) => building.id === selectedBuildingId,
              )
              if (currentIndex > 0) {
                setSelectedBuildingId(buildings[currentIndex - 1].id)
              }
            }}
            onNext={() => {
              const currentIndex = buildings.findIndex(
                (building) => building.id === selectedBuildingId,
              )
              if (currentIndex < buildings.length - 1) {
                setSelectedBuildingId(buildings[currentIndex + 1].id)
              }
            }}
            hasPrevious={
              buildings.findIndex(
                (building) => building.id === selectedBuildingId,
              ) > 0
            }
            hasNext={
              buildings.findIndex(
                (building) => building.id === selectedBuildingId,
              ) <
              buildings.length - 1
            }
          />
        )}
      </div>
    </div>
  )
}

function BuildingReadingsTable({
  building,
  reportTrigger,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  building: Building
  reportTrigger: number
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
}) {
  const {
    data: readingsData,
    isLoading,
    error,
  } = useQuery<ApiListResponse<Reading>>({
    queryKey: ["readings", building.id],
    queryFn: () =>
      apiCall("/api/v1/readings/", {
        skip: 0,
        limit: 1000,
        building_id: building.id,
      }),
  })

  const readings = (readingsData?.data || []) as Reading[]

  // Determine which types this building has (bitmask: 1=Low, 2=Normal, 4=Gas)
  const hasLow = (building.reading_types & 1) !== 0
  const hasNormal = (building.reading_types & 2) !== 0
  const hasGas = (building.reading_types & 4) !== 0

  // Define interface for grouped readings
  interface ReadingByDate {
    date: string
    low?: number
    normal?: number
    gas?: number
    lowId?: EntityId
    normalId?: EntityId
    gasId?: EntityId
  }

  // Calculate days, used values, and percentages
  interface ProcessedReading extends ReadingByDate {
    days: number
    lowUsed?: number
    lowPercent?: string
    normalUsed?: number
    normalPercent?: string
    gasUsed?: number
    gasPercent?: string
  }

  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [editingRow, setEditingRow] = useState<ProcessedReading | null>(null)
  const [editValues, setEditValues] = useState<{
    date?: string
    low?: string
    normal?: string
    gas?: string
  }>({})
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportDateFrom, setReportDateFrom] = useState("")
  const [reportDateTo, setReportDateTo] = useState("")
  const [reportEmail, setReportEmail] = useState("")
  const [isSendingReport, setIsSendingReport] = useState(false)

  useEffect(() => {
    if (reportTrigger > 0) {
      setShowReportModal(true)
    }
  }, [reportTrigger])

  if (isLoading) {
    return <p className="text-center text-[#55311c]">Loading readings...</p>
  }

  if (error || !readings.length) {
    return (
      <p className="text-center text-[#55311c]">
        No readings found for this building
      </p>
    )
  }

  // Group readings by date
  const readingsByDate: Record<string, ReadingByDate> = {}
  for (const reading of readings) {
    if (!reading?.data || typeof reading.data !== "string") continue
    // Parse date string directly without timezone conversion
    const dateStr = reading.data.split("T")[0]
    if (!readingsByDate[dateStr]) {
      readingsByDate[dateStr] = {
        date: reading.data,
        low: undefined,
        normal: undefined,
        gas: undefined,
      }
    }
    if (reading.tipo === 1) {
      readingsByDate[dateStr].low = reading.valor
      readingsByDate[dateStr].lowId = reading.id
    }
    if (reading.tipo === 2) {
      readingsByDate[dateStr].normal = reading.valor
      readingsByDate[dateStr].normalId = reading.id
    }
    if (reading.tipo === 4) {
      readingsByDate[dateStr].gas = reading.valor
      readingsByDate[dateStr].gasId = reading.id
    }
  }

  // Convert to array and sort by date (newest first)
  const sortedReadings: ReadingByDate[] = Object.values(readingsByDate).sort(
    (a, b) => {
      const dateA = a.date.split("T")[0]
      const dateB = b.date.split("T")[0]
      return dateB.localeCompare(dateA) // Descending order
    },
  )

  const processedData: ProcessedReading[] = sortedReadings.map(
    (current, index) => {
      const previous: ReadingByDate | undefined = sortedReadings[index + 1]
      const previousPrevious: ReadingByDate | undefined =
        sortedReadings[index + 2]

      let days = 0
      if (previous) {
        // Parse dates as strings to avoid timezone issues
        const [currY, currM, currD] = current.date
          .split("T")[0]
          .split("-")
          .map(Number)
        const [prevY, prevM, prevD] = previous.date
          .split("T")[0]
          .split("-")
          .map(Number)
        const currDate = new Date(currY, currM - 1, currD)
        const prevDate = new Date(prevY, prevM - 1, prevD)
        days = Math.round(
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      }

      const result: ProcessedReading = {
        ...current,
        days,
      }

      // Calculate Low values
      if (hasLow && current.low !== undefined) {
        result.low = current.low
        if (previous && previous.low !== undefined) {
          result.lowUsed = current.low - previous.low
          // Calculate percentage: (current used * 100) / previous used
          if (previousPrevious && previousPrevious.low !== undefined) {
            const previousUsed = previous.low - previousPrevious.low
            result.lowPercent =
              previousUsed !== 0
                ? (
                    ((result.lowUsed - previousUsed) / previousUsed) *
                    100
                  ).toFixed(2)
                : "0.00"
          }
        }
      }

      // Calculate Normal values
      if (hasNormal && current.normal !== undefined) {
        result.normal = current.normal
        if (previous && previous.normal !== undefined) {
          result.normalUsed = current.normal - previous.normal
          // Calculate percentage: (current used * 100) / previous used
          if (previousPrevious && previousPrevious.normal !== undefined) {
            const previousUsed = previous.normal - previousPrevious.normal
            result.normalPercent =
              previousUsed !== 0
                ? (
                    ((result.normalUsed - previousUsed) / previousUsed) *
                    100
                  ).toFixed(2)
                : "0.00"
          }
        }
      }

      // Calculate Gas values
      if (hasGas && current.gas !== undefined) {
        result.gas = current.gas
        if (previous && previous.gas !== undefined) {
          result.gasUsed = current.gas - previous.gas
          // Calculate percentage: (current used * 100) / previous used
          if (previousPrevious && previousPrevious.gas !== undefined) {
            const previousUsed = previous.gas - previousPrevious.gas
            result.gasPercent =
              previousUsed !== 0
                ? (
                    ((result.gasUsed - previousUsed) / previousUsed) *
                    100
                  ).toFixed(2)
                : "0.00"
          }
        }
      }

      return result
    },
  )

  // Get color class based on percentage value
  const getPercentColor = (percent: string | undefined) => {
    if (!percent) return ""
    const value = parseFloat(percent)
    if (value < 0) return "bg-green-200" // Economy
    if (value > 20) return "bg-red-200" // High consumption
    if (value > 10) return "bg-orange-100" // Medium-high consumption
    return "bg-yellow-50" // Normal consumption
  }

  const handleOpenEdit = (row: ProcessedReading) => {
    const dateOnly = row.date ? row.date.split("T")[0] : ""
    setEditingRow(row)
    setEditValues({
      date: dateOnly,
      low: row.low !== undefined ? String(row.low) : "",
      normal: row.normal !== undefined ? String(row.normal) : "",
      gas: row.gas !== undefined ? String(row.gas) : "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editingRow) return

    try {
      const updates: Promise<unknown>[] = []
      const dateOnly = editValues.date?.trim() || ""
      const originalDateOnly = editingRow.date.split("T")[0]
      const timePart = editingRow.date.split("T")[1] || "00:00:00"
      const dateChanged = Boolean(dateOnly) && dateOnly !== originalDateOnly
      const nextDate = dateChanged ? `${dateOnly}T${timePart}` : undefined

      if (
        editingRow.lowId &&
        editValues.low !== undefined &&
        editValues.low.trim() !== "" &&
        (Number(editValues.low) !== editingRow.low || dateChanged)
      ) {
        updates.push(
          apiCall(`/api/v1/readings/${editingRow.lowId}`, {
            method: "PATCH",
            body: {
              valor: Number(editValues.low),
              ...(nextDate ? { data: nextDate } : {}),
            },
          }),
        )
      } else if (editingRow.lowId && dateChanged) {
        updates.push(
          apiCall(`/api/v1/readings/${editingRow.lowId}`, {
            method: "PATCH",
            body: { data: nextDate },
          }),
        )
      }

      if (
        editingRow.normalId &&
        editValues.normal !== undefined &&
        editValues.normal.trim() !== "" &&
        (Number(editValues.normal) !== editingRow.normal || dateChanged)
      ) {
        updates.push(
          apiCall(`/api/v1/readings/${editingRow.normalId}`, {
            method: "PATCH",
            body: {
              valor: Number(editValues.normal),
              ...(nextDate ? { data: nextDate } : {}),
            },
          }),
        )
      } else if (editingRow.normalId && dateChanged) {
        updates.push(
          apiCall(`/api/v1/readings/${editingRow.normalId}`, {
            method: "PATCH",
            body: { data: nextDate },
          }),
        )
      }

      if (
        editingRow.gasId &&
        editValues.gas !== undefined &&
        editValues.gas.trim() !== "" &&
        (Number(editValues.gas) !== editingRow.gas || dateChanged)
      ) {
        updates.push(
          apiCall(`/api/v1/readings/${editingRow.gasId}`, {
            method: "PATCH",
            body: {
              valor: Number(editValues.gas),
              ...(nextDate ? { data: nextDate } : {}),
            },
          }),
        )
      } else if (editingRow.gasId && dateChanged) {
        updates.push(
          apiCall(`/api/v1/readings/${editingRow.gasId}`, {
            method: "PATCH",
            body: { data: nextDate },
          }),
        )
      }

      if (updates.length === 0) {
        showErrorToast("No changes detected")
        return
      }

      await Promise.all(updates)
      showSuccessToast("Readings updated successfully")
      queryClient.invalidateQueries({ queryKey: ["readings", building.id] })
      setEditingRow(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error updating readings"
      showErrorToast(message)
    }
  }

  const handleSendReport = async () => {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      showErrorToast("Invalid date range")
      return
    }
    if (!reportEmail.trim()) {
      showErrorToast("Email is required")
      return
    }

    const filteredRows = processedData
      .slice(0, -1)
      .filter((row) =>
        isDateWithinRange(row.date, reportDateFrom, reportDateTo),
      )

    if (filteredRows.length === 0) {
      showErrorToast("No readings found in the selected range")
      return
    }

    const headers = ["Days", "Date"]
    if (hasLow) headers.push("Low", "Low used", "Low %")
    if (hasNormal) headers.push("Normal", "Normal used", "Normal %")
    if (hasGas) headers.push("Gas", "Gas used", "Gas %")

    const rows = filteredRows.map((row) => {
      const values: (string | number)[] = [
        row.days || "-",
        formatDateToBr(row.date),
      ]
      if (hasLow)
        values.push(row.low ?? "-", row.lowUsed ?? "-", row.lowPercent ?? "-")
      if (hasNormal)
        values.push(
          row.normal ?? "-",
          row.normalUsed ?? "-",
          row.normalPercent ?? "-",
        )
      if (hasGas)
        values.push(row.gas ?? "-", row.gasUsed ?? "-", row.gasPercent ?? "-")
      return values
    })

    const reportTitle = `Readings Report - Building ${building.nome}`
    const fileName = `readings-building-${building.nome.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`
    const fileDataBase64 = generatePdfTableReportBase64({
      title: reportTitle,
      dateRange: buildDateRangeLabel(reportDateFrom, reportDateTo),
      headers,
      rows,
    })
    if (!fileDataBase64) {
      showErrorToast("Failed to prepare report file")
      return
    }

    try {
      setIsSendingReport(true)
      await apiCall("/api/v1/utils/send-report-email/", {
        method: "POST",
        body: {
          email_to: reportEmail.trim(),
          subject: reportTitle,
          html_content: buildReadingsReportEmailHtml({
            reportType: "Building",
            locationLabel: building.nome,
            periodLabel: buildDateRangeLabel(reportDateFrom, reportDateTo),
          }),
          file_name: fileName,
          file_data_base64: fileDataBase64,
        },
      })
      setShowReportModal(false)
      showSuccessToast("Report sent successfully")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send report by email"
      showErrorToast(message)
    } finally {
      setIsSendingReport(false)
    }
  }

  return (
    <div className="overflow-x-hidden md:overflow-x-auto">
      {/* Building Header */}
      <div className="relative mb-4 flex items-center justify-between gap-2 rounded-t-lg bg-[#2d8659] p-3 text-white md:p-4">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          disabled={!hasPrevious}
          className={`rounded-full p-2 transition-all duration-200 md:absolute md:left-4 md:top-1/2 md:-translate-y-1/2 ${
            hasPrevious
              ? "bg-white/20 hover:bg-white/30 cursor-pointer"
              : "bg-white/10 cursor-not-allowed opacity-50"
          }`}
          type="button"
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Previous building</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Building Info */}
        <div className="flex-1 px-1 text-center md:px-0">
          <h3 className="text-xl font-bold font-['Nunito',sans-serif] sm:text-2xl">
            {building.nome}
          </h3>
          <div className="mt-2 flex flex-col items-center justify-center gap-1 text-xs sm:flex-row sm:gap-6 sm:text-sm">
            <p>Electricity S/N: {building.electricity_sn || "N/A"}</p>
            {building.gas_sn && <p>Gas S/N: {building.gas_sn}</p>}
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className={`rounded-full p-2 transition-all duration-200 md:absolute md:right-4 md:top-1/2 md:-translate-y-1/2 ${
            hasNext
              ? "bg-white/20 hover:bg-white/30 cursor-pointer"
              : "bg-white/10 cursor-not-allowed opacity-50"
          }`}
          type="button"
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Next building</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      <div className="space-y-3 md:hidden">
        {processedData.slice(0, -1).map((row) => (
          <div
            key={`mobile-${row.date}-${row.lowId ?? ""}-${row.normalId ?? ""}-${row.gasId ?? ""}`}
            className="rounded-lg border border-[#d9d0ca] bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-[#55311c]">
                {formatDateToBr(row.date)}
              </p>
              <p className="text-xs text-[rgba(0,0,0,0.7)]">
                Days: {row.days || "-"}
              </p>
            </div>
            <div className="space-y-2 text-xs text-[#55311c]">
              {hasLow && (
                <div className="rounded-md bg-[#f7f2ee] p-2">
                  <p className="font-semibold">Low: {row.low ?? "-"}</p>
                  <p className="mt-1">Used: {row.lowUsed ?? "-"}</p>
                  <p className={`mt-1 ${getPercentColor(row.lowPercent)}`}>
                    %: {row.lowPercent ?? "no data"}
                  </p>
                </div>
              )}
              {hasNormal && (
                <div className="rounded-md bg-[#f7f2ee] p-2">
                  <p className="font-semibold">Normal: {row.normal ?? "-"}</p>
                  <p className="mt-1">Used: {row.normalUsed ?? "-"}</p>
                  <p className={`mt-1 ${getPercentColor(row.normalPercent)}`}>
                    %: {row.normalPercent ?? "no data"}
                  </p>
                </div>
              )}
              {hasGas && (
                <div className="rounded-md bg-[#f7f2ee] p-2">
                  <p className="font-semibold">Gas: {row.gas ?? "-"}</p>
                  <p className="mt-1">Used: {row.gasUsed ?? "-"}</p>
                  <p className={`mt-1 ${getPercentColor(row.gasPercent)}`}>
                    %: {row.gasPercent ?? "no data"}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => handleOpenEdit(row)}
                className="w-full rounded-lg bg-[#8c7569] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Edit
              </button>
            </div>
          </div>
        ))}

        {processedData.length > 0 && (
          <div className="rounded-lg border border-[#d9d0ca] bg-[#f7f2ee] p-3">
            <p className="text-sm font-bold text-[#55311c]">
              All (initial values)
            </p>
            <p className="mt-1 text-xs text-[rgba(0,0,0,0.7)]">
              Date:{" "}
              {formatDateToBr(processedData[processedData.length - 1].date)}
            </p>
            <div className="mt-2 space-y-1 text-xs text-[#55311c]">
              {hasLow && (
                <p>
                  Low:{" "}
                  {processedData[processedData.length - 1].low !== undefined
                    ? processedData[processedData.length - 1].low
                    : "All"}
                </p>
              )}
              {hasNormal && (
                <p>
                  Normal:{" "}
                  {processedData[processedData.length - 1].normal !== undefined
                    ? processedData[processedData.length - 1].normal
                    : "All"}
                </p>
              )}
              {hasGas && (
                <p>
                  Gas:{" "}
                  {processedData[processedData.length - 1].gas !== undefined
                    ? processedData[processedData.length - 1].gas
                    : "All"}
                </p>
              )}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() =>
                  handleOpenEdit(processedData[processedData.length - 1])
                }
                className="w-full rounded-lg bg-[#8c7569] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>

      <table className="hidden w-full min-w-[840px] border-collapse md:table">
        <thead>
          <tr className="bg-gray-200">
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Days
            </th>
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Date
            </th>
            {hasLow && (
              <>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  Low
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700 italic">
                  used
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  %
                </th>
              </>
            )}
            {hasNormal && (
              <>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  Normal
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700 italic">
                  used
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  %
                </th>
              </>
            )}
            {hasGas && (
              <>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  Gas
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700 italic">
                  used
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  %
                </th>
              </>
            )}
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Data rows */}
          {processedData.slice(0, -1).map((row, index) => (
            <tr
              key={`${row.date}-${row.lowId ?? ""}-${row.normalId ?? ""}-${row.gasId ?? ""}`}
              className={`${
                index % 2 === 0 ? "bg-white" : "bg-gray-50"
              } hover:bg-gray-100 transition-colors duration-150`}
            >
              <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                {row.days || "-"}
              </td>
              <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                {(() => {
                  const dateStr = row.date.split("T")[0]
                  const [y, m, d] = dateStr.split("-")
                  return `${d}/${m}/${y}`
                })()}
              </td>
              {hasLow && (
                <>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                    {row.low !== undefined ? row.low : "-"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                    {row.lowUsed !== undefined ? row.lowUsed : "-"}
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center ${getPercentColor(
                      row.lowPercent,
                    )}`}
                  >
                    {row.lowPercent !== undefined ? row.lowPercent : "no data"}
                  </td>
                </>
              )}
              {hasNormal && (
                <>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                    {row.normal !== undefined ? row.normal : "-"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                    {row.normalUsed !== undefined ? row.normalUsed : "-"}
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center ${getPercentColor(
                      row.normalPercent,
                    )}`}
                  >
                    {row.normalPercent !== undefined
                      ? row.normalPercent
                      : "no data"}
                  </td>
                </>
              )}
              {hasGas && (
                <>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                    {row.gas !== undefined ? row.gas : "-"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                    {row.gasUsed !== undefined ? row.gasUsed : "-"}
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center ${getPercentColor(
                      row.gasPercent,
                    )}`}
                  >
                    {row.gasPercent !== undefined ? row.gasPercent : "no data"}
                  </td>
                </>
              )}
              <td className="border border-gray-400 px-3 py-2 text-sm text-gray-800">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(row)}
                  className="rounded-lg bg-[#8c7569] px-3 py-1 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}

          {/* "All" row with initial values - moved to bottom */}
          <tr className="bg-white hover:bg-gray-50">
            <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 font-semibold">
              All
            </td>
            <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
              {processedData.length > 0
                ? (() => {
                    const dateStr =
                      processedData[processedData.length - 1].date.split("T")[0]
                    const [y, m, d] = dateStr.split("-")
                    return `${d}/${m}/${y}`
                  })()
                : "-"}
            </td>
            {hasLow && (
              <>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                  {processedData.length > 0 &&
                  processedData[processedData.length - 1].low !== undefined
                    ? processedData[processedData.length - 1].low
                    : "All"}
                </td>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                  All
                </td>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                  no data
                </td>
              </>
            )}
            {hasNormal && (
              <>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                  {processedData.length > 0 &&
                  processedData[processedData.length - 1].normal !== undefined
                    ? processedData[processedData.length - 1].normal
                    : "All"}
                </td>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                  All
                </td>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                  no data
                </td>
              </>
            )}
            {hasGas && (
              <>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                  {processedData.length > 0 &&
                  processedData[processedData.length - 1].gas !== undefined
                    ? processedData[processedData.length - 1].gas
                    : "All"}
                </td>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                  All
                </td>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 text-center">
                  no data
                </td>
              </>
            )}
            <td className="border border-gray-400 px-3 py-2 text-sm text-gray-800">
              {processedData.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    handleOpenEdit(processedData[processedData.length - 1])
                  }
                  className="rounded-lg bg-[#8c7569] px-3 py-1 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
                >
                  Edit
                </button>
              ) : (
                "-"
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">Edit readings</h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Date: {editingRow.date.split("T")[0]}
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="edit-reading-date"
                >
                  Date
                </label>
                <input
                  type="date"
                  id="edit-reading-date"
                  value={editValues.date || ""}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              {hasLow && (
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="edit-reading-low"
                  >
                    Low
                  </label>
                  <input
                    type="number"
                    id="edit-reading-low"
                    value={editValues.low || ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        low: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              )}

              {hasNormal && (
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="edit-reading-normal"
                  >
                    Normal
                  </label>
                  <input
                    type="number"
                    id="edit-reading-normal"
                    value={editValues.normal || ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        normal: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              )}

              {hasGas && (
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="edit-reading-gas"
                  >
                    Gas
                  </label>
                  <input
                    type="number"
                    id="edit-reading-gas"
                    value={editValues.gas || ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        gas: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] sm:w-auto"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">
              Generate report
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Enter email and date range to send the PDF report.
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="building-report-email"
                >
                  Email
                </label>
                <input
                  id="building-report-email"
                  type="email"
                  value={reportEmail}
                  onChange={(e) => setReportEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="building-report-date-from"
                >
                  Start date
                </label>
                <input
                  id="building-report-date-from"
                  type="date"
                  value={reportDateFrom}
                  onChange={(e) => setReportDateFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="building-report-date-to"
                >
                  End date
                </label>
                <input
                  id="building-report-date-to"
                  type="date"
                  min={reportDateFrom || undefined}
                  value={reportDateTo}
                  onChange={(e) => setReportDateTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendReport}
                disabled={isSendingReport}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] sm:w-auto"
              >
                {isSendingReport ? "Sending..." : "Send by email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddReadingsForm({
  buildings,
  onBack,
}: {
  buildings: Building[]
  onBack: () => void
}) {
  const [formData, setFormData] = useState<
    Record<string, Record<string, string>>
  >({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize form data with building IDs
  useEffect(() => {
    const initialData: Record<string, Record<string, string>> = {}
    buildings.forEach((building) => {
      const buildingKey = String(building.id)
      initialData[buildingKey] = {}
      const hasLow = (building.reading_types & 1) !== 0
      const hasNormal = (building.reading_types & 2) !== 0
      const hasGas = (building.reading_types & 4) !== 0

      if (hasLow) initialData[buildingKey].low = ""
      if (hasNormal) initialData[buildingKey].normal = ""
      if (hasGas) initialData[buildingKey].gas = ""
    })
    setFormData(initialData)
  }, [buildings])

  const handleInputChange = (
    buildingId: EntityId,
    type: string,
    value: string,
  ) => {
    const buildingKey = String(buildingId)
    setFormData((prev) => ({
      ...prev,
      [buildingKey]: {
        ...prev[buildingKey],
        [type]: value,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const readings: NewReadingPayload[] = []

      // Convert form data to API format
      Object.entries(formData).forEach(([buildingId, types]) => {
        Object.entries(types).forEach(([type, value]) => {
          if (value && value.trim() !== "") {
            let tipoValue = 0
            if (type === "low") tipoValue = 1
            else if (type === "normal") tipoValue = 2
            else if (type === "gas") tipoValue = 4

            readings.push({
              building_id: buildingId,
              tipo: tipoValue,
              valor: parseInt(value, 10),
            })
          }
        })
      })

      // Submit all readings
      for (const reading of readings) {
        await fetch(
          `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/readings/`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
            body: JSON.stringify(reading),
          },
        )
      }

      alert("Readings registered successfully!")
      onBack()
    } catch (error) {
      console.error("Error submitting readings:", error)
      alert("Error creating readings")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[110rem]">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Add Readings
          </h2>
          <button
            onClick={onBack}
            className="rounded-lg bg-gray-500 px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-gray-600"
            type="button"
          >
            Back
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {[...buildings]
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map((building) => {
                const hasLow = (building.reading_types & 1) !== 0
                const hasNormal = (building.reading_types & 2) !== 0
                const hasGas = (building.reading_types & 4) !== 0

                return (
                  <div
                    key={building.id}
                    className="rounded-lg border-2 border-[#ddd] p-6"
                  >
                    <h3 className="mb-4 font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
                      {building.nome}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-3">
                      {hasLow && (
                        <div>
                          <label
                            className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                            htmlFor={`building-${building.id}-low`}
                          >
                            Low
                          </label>
                          <input
                            type="number"
                            id={`building-${building.id}-low`}
                            value={formData[String(building.id)]?.low || ""}
                            onChange={(e) =>
                              handleInputChange(
                                building.id,
                                "low",
                                e.target.value,
                              )
                            }
                            className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                            placeholder="Valor Low"
                          />
                        </div>
                      )}

                      {hasNormal && (
                        <div>
                          <label
                            className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                            htmlFor={`building-${building.id}-normal`}
                          >
                            Normal
                          </label>
                          <input
                            type="number"
                            id={`building-${building.id}-normal`}
                            value={formData[String(building.id)]?.normal || ""}
                            onChange={(e) =>
                              handleInputChange(
                                building.id,
                                "normal",
                                e.target.value,
                              )
                            }
                            className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                            placeholder="Valor Normal"
                          />
                        </div>
                      )}

                      {hasGas && (
                        <div>
                          <label
                            className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                            htmlFor={`building-${building.id}-gas`}
                          >
                            Gas
                          </label>
                          <input
                            type="number"
                            id={`building-${building.id}-gas`}
                            value={formData[String(building.id)]?.gas || ""}
                            onChange={(e) =>
                              handleInputChange(
                                building.id,
                                "gas",
                                e.target.value,
                              )
                            }
                            className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                            placeholder="Valor Gas"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>

          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-gray-500 px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#8c7569] px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Readings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddFlatReadingsForm({
  buildings,
  onBack,
}: {
  buildings: Building[]
  onBack: () => void
}) {
  const [formData, setFormData] = useState<
    Record<string, Record<string, string>>
  >({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Initialize form data with flat IDs - only include flats with reading_types != 0
  useEffect(() => {
    const initialData: Record<string, Record<string, string>> = {}
    buildings.forEach((building) => {
      building.flats?.forEach((flat) => {
        // Skip flats without readings
        if (flat.reading_types === 0) return

        const flatKey = String(flat.id)
        initialData[flatKey] = {}
        const hasLow = (flat.reading_types & 1) !== 0
        const hasNormal = (flat.reading_types & 2) !== 0
        const hasGas = (flat.reading_types & 4) !== 0

        if (hasLow) initialData[flatKey].low = ""
        if (hasNormal) initialData[flatKey].normal = ""
        if (hasGas) initialData[flatKey].gas = ""
      })
    })
    setFormData(initialData)
  }, [buildings])

  const handleInputChange = (flatId: EntityId, type: string, value: string) => {
    const flatKey = String(flatId)
    setFormData((prev) => ({
      ...prev,
      [flatKey]: {
        ...prev[flatKey],
        [type]: value,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const readings: NewReadingPayload[] = []

      // Convert form data to API format
      Object.entries(formData).forEach(([flatId, types]) => {
        Object.entries(types).forEach(([type, value]) => {
          if (value && value.trim() !== "") {
            let tipoValue = 0
            if (type === "low") tipoValue = 1
            else if (type === "normal") tipoValue = 2
            else if (type === "gas") tipoValue = 4

            readings.push({
              flat_id: flatId,
              tipo: tipoValue,
              valor: parseInt(value, 10),
              data: new Date().toISOString(), // Add current datetime in ISO format
            })
          }
        })
      })

      // Submit all readings
      for (const reading of readings) {
        await fetch(
          `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/flat_readings/`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
            body: JSON.stringify(reading),
          },
        )
      }

      // Invalidate cache so new readings show up
      queryClient.invalidateQueries({ queryKey: ["flat_readings"] })

      showSuccessToast("Readings registered successfully!")
      onBack()
    } catch (error) {
      console.error("Error submitting readings:", error)
      showErrorToast("Error creating readings")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Get flats grouped by building
  const buildingsWithFlats = buildings
    .map((building) => ({
      ...building,
      flats: building.flats?.filter((flat) => flat.reading_types !== 0) || [],
    }))
    .filter((building) => building.flats.length > 0)

  if (buildingsWithFlats.length === 0) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Add Flat Readings
            </h2>
            <button
              onClick={onBack}
              className="rounded-lg bg-gray-500 px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-gray-600"
              type="button"
            >
              Back
            </button>
          </div>
          <p className="text-[#55311c] font-['Nunito',sans-serif]">
            No flat with configured readings found
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Add Flat Readings
          </h2>
          <button
            onClick={onBack}
            className="rounded-lg bg-gray-500 px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-gray-600"
            type="button"
          >
            Back
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {buildingsWithFlats.map((building) => (
              <div
                key={building.id}
                className="rounded-lg border-2 border-[#8c7569] p-4"
              >
                <h3 className="mb-4 font-['Nunito',sans-serif] text-xl font-bold text-[#8c7569]">
                  {building.nome}
                </h3>

                <div className="space-y-4">
                  {[...building.flats]
                    .sort((a, b) => a.numero - b.numero)
                    .map((flat) => {
                      const hasLow = (flat.reading_types & 1) !== 0
                      const hasNormal = (flat.reading_types & 2) !== 0
                      const hasGas = (flat.reading_types & 4) !== 0

                      return (
                        <div
                          key={flat.id}
                          className="rounded-lg border-2 border-[#ddd] p-4"
                        >
                          <h4 className="mb-3 font-['Nunito',sans-serif] text-lg font-semibold text-[#55311c]">
                            {formatFlatLabel(flat.numero, flat.label)}
                          </h4>

                          <div className="grid gap-4 md:grid-cols-3">
                            {hasLow && (
                              <div>
                                <label
                                  className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                                  htmlFor={`flat-${flat.id}-low`}
                                >
                                  Low
                                </label>
                                <input
                                  type="number"
                                  id={`flat-${flat.id}-low`}
                                  value={formData[String(flat.id)]?.low || ""}
                                  onChange={(e) =>
                                    handleInputChange(
                                      flat.id,
                                      "low",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                                  placeholder="Valor Low"
                                />
                              </div>
                            )}

                            {hasNormal && (
                              <div>
                                <label
                                  className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                                  htmlFor={`flat-${flat.id}-normal`}
                                >
                                  Normal
                                </label>
                                <input
                                  type="number"
                                  id={`flat-${flat.id}-normal`}
                                  value={
                                    formData[String(flat.id)]?.normal || ""
                                  }
                                  onChange={(e) =>
                                    handleInputChange(
                                      flat.id,
                                      "normal",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                                  placeholder="Valor Normal"
                                />
                              </div>
                            )}

                            {hasGas && (
                              <div>
                                <label
                                  className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                                  htmlFor={`flat-${flat.id}-gas`}
                                >
                                  Gas
                                </label>
                                <input
                                  type="number"
                                  id={`flat-${flat.id}-gas`}
                                  value={formData[String(flat.id)]?.gas || ""}
                                  onChange={(e) =>
                                    handleInputChange(
                                      flat.id,
                                      "gas",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                                  placeholder="Valor Gas"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-gray-500 px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#8c7569] px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Readings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FlatsReadingsContent({
  initialShowForm = false,
}: {
  initialShowForm?: boolean
}) {
  const [selectedBuildingId, setSelectedBuildingId] = useState<EntityId | null>(
    null,
  )
  const [selectedFlatId, setSelectedFlatId] = useState<EntityId | null>(null)
  const [showForm, setShowForm] = useState(initialShowForm)

  const { data: buildingsData, isLoading: buildingsLoading } = useQuery<
    ApiListResponse<Building>
  >({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = buildingsData?.data || []
  const selectedBuilding = buildings.find(
    (building) => building.id === selectedBuildingId,
  )
  const allFlats = selectedBuilding?.flats || []
  const flats = allFlats.filter((flat) => flat.reading_types !== 0)

  // Reset flat selection when building changes
  useEffect(() => {
    if (selectedBuildingId !== null) {
      setSelectedFlatId(null)
    }
  }, [selectedBuildingId])

  useEffect(() => {
    if (selectedFlatId && !flats.some((flat) => flat.id === selectedFlatId)) {
      setSelectedFlatId(null)
    }
  }, [flats, selectedFlatId])

  useEffect(() => {
    if (initialShowForm) {
      setShowForm(true)
    }
  }, [initialShowForm])

  if (buildingsLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Loading buildings...</p>
        </div>
      </div>
    )
  }

  if (!buildings.length) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">No building found</p>
        </div>
      </div>
    )
  }

  const selectedFlat = flats.find((flat) => flat.id === selectedFlatId)

  if (showForm) {
    return (
      <AddFlatReadingsForm
        buildings={buildings}
        onBack={() => setShowForm(false)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-4 shadow-md sm:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Flats - Readings
          </h2>
          <button
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c] sm:w-auto"
            type="button"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Add reading</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Reading
          </button>
        </div>

        {/* Building Selection */}
        <div className="mb-6">
          <p className="block font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c] mb-3">
            Select a building:
          </p>
          <div className="w-full overflow-x-auto pb-1">
            <div className="flex min-w-max gap-3">
              {[...buildings]
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map((building) => (
                  <button
                    key={building.id}
                    onClick={() => setSelectedBuildingId(building.id)}
                    className={`rounded-lg px-5 py-2.5 font-['Nunito',sans-serif] font-semibold whitespace-nowrap transition-all duration-200 ${
                      selectedBuildingId === building.id
                        ? "bg-[#55311c] text-white shadow-lg"
                        : "bg-[#e8e4e1] text-[#55311c] hover:bg-[#ddd8d5]"
                    }`}
                    type="button"
                  >
                    {building.nome}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Flat Selection */}
        {selectedBuildingId && (
          <div className="mb-6">
            <p className="block font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c] mb-3">
              Select a flat:
            </p>
            {flats.length > 0 ? (
              <div className="w-full overflow-x-auto pb-1">
                <div className="flex min-w-max gap-3">
                  {[...flats]
                    .sort((a, b) => a.numero - b.numero)
                    .map((flat) => (
                      <button
                        key={flat.id}
                        onClick={() => setSelectedFlatId(flat.id)}
                        className={`rounded-lg px-5 py-2.5 font-['Nunito',sans-serif] font-semibold whitespace-nowrap transition-all duration-200 ${
                          selectedFlatId === flat.id
                            ? "bg-[#55311c] text-white shadow-lg"
                            : "bg-[#e8e4e1] text-[#55311c] hover:bg-[#ddd8d5]"
                        }`}
                        type="button"
                      >
                        {formatFlatLabel(flat.numero, flat.label)}
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-[#f5f1ee] p-4">
                <p className="text-[#55311c] font-['Nunito',sans-serif]">
                  No flat with configured readings in this building
                </p>
              </div>
            )}
          </div>
        )}

        {selectedFlat && (
          <FlatReadingsTable
            flat={selectedFlat}
            onPrevious={() => {
              const currentIndex = flats.findIndex(
                (flat) => flat.id === selectedFlatId,
              )
              if (currentIndex > 0) {
                setSelectedFlatId(flats[currentIndex - 1].id)
              }
            }}
            onNext={() => {
              const currentIndex = flats.findIndex(
                (flat) => flat.id === selectedFlatId,
              )
              if (currentIndex < flats.length - 1) {
                setSelectedFlatId(flats[currentIndex + 1].id)
              }
            }}
            hasPrevious={
              flats.findIndex((flat) => flat.id === selectedFlatId) > 0
            }
            hasNext={
              flats.findIndex((flat) => flat.id === selectedFlatId) <
              flats.length - 1
            }
          />
        )}
      </div>
    </div>
  )
}

function FlatReadingsTable({
  flat,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  flat: Flat
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
}) {
  const {
    data: readingsData,
    isLoading,
    error,
  } = useQuery<ApiListResponse<Reading>>({
    queryKey: ["flat_readings", flat.id],
    queryFn: () =>
      apiCall("/api/v1/flat_readings/", {
        skip: 0,
        limit: 1000,
        flat_id: flat.id,
      }),
  })

  const readings = (readingsData?.data || []) as Reading[]

  // Determine which types this flat has (bitmask: 1=Low, 2=Normal, 4=Gas)
  const hasLow = (flat.reading_types & 1) !== 0
  const hasNormal = (flat.reading_types & 2) !== 0
  const hasGas = (flat.reading_types & 4) !== 0
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [editingRow, setEditingRow] = useState<ProcessedReading | null>(null)
  const [editValues, setEditValues] = useState<{
    date?: string
    low?: string
    normal?: string
    gas?: string
  }>({})
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportDateFrom, setReportDateFrom] = useState("")
  const [reportDateTo, setReportDateTo] = useState("")
  const [reportEmail, setReportEmail] = useState("")
  const [isSendingReport, setIsSendingReport] = useState(false)

  if (isLoading) {
    return <p className="text-center text-[#55311c]">Loading readings...</p>
  }

  if (error || !readings.length) {
    return (
      <p className="text-center text-[#55311c]">
        No readings found for this flat
      </p>
    )
  }

  // Define interface for grouped readings
  interface ReadingByDate {
    date: string
    low?: number
    normal?: number
    gas?: number
    lowId?: EntityId
    normalId?: EntityId
    gasId?: EntityId
  }

  // Group readings by date
  const readingsByDate: Record<string, ReadingByDate> = {}
  for (const reading of readings) {
    if (!reading?.data || typeof reading.data !== "string") continue
    // Parse date string directly without timezone conversion
    const dateStr = reading.data.split("T")[0]
    if (!readingsByDate[dateStr]) {
      readingsByDate[dateStr] = {
        date: reading.data,
        low: undefined,
        normal: undefined,
        gas: undefined,
      }
    }
    if (reading.tipo === 1) {
      readingsByDate[dateStr].low = reading.valor
      readingsByDate[dateStr].lowId = reading.id
    }
    if (reading.tipo === 2) {
      readingsByDate[dateStr].normal = reading.valor
      readingsByDate[dateStr].normalId = reading.id
    }
    if (reading.tipo === 4) {
      readingsByDate[dateStr].gas = reading.valor
      readingsByDate[dateStr].gasId = reading.id
    }
  }

  // Convert to array and sort by date (newest first)
  const sortedReadings: ReadingByDate[] = Object.values(readingsByDate).sort(
    (a, b) => {
      const dateA = a.date.split("T")[0]
      const dateB = b.date.split("T")[0]
      return dateB.localeCompare(dateA) // Descending order
    },
  )

  // Calculate days, used values, and percentages
  interface ProcessedReading extends ReadingByDate {
    days: number
    lowUsed?: number
    lowPercent?: string
    normalUsed?: number
    normalPercent?: string
    gasUsed?: number
    gasPercent?: string
  }

  const processedData: ProcessedReading[] = sortedReadings.map(
    (current, index) => {
      const previous: ReadingByDate | undefined = sortedReadings[index + 1]
      const previousPrevious: ReadingByDate | undefined =
        sortedReadings[index + 2]

      let days = 0
      if (previous) {
        // Parse dates as strings to avoid timezone issues
        const [currY, currM, currD] = current.date
          .split("T")[0]
          .split("-")
          .map(Number)
        const [prevY, prevM, prevD] = previous.date
          .split("T")[0]
          .split("-")
          .map(Number)
        const currDate = new Date(currY, currM - 1, currD)
        const prevDate = new Date(prevY, prevM - 1, prevD)
        days = Math.round(
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      }

      const result: ProcessedReading = {
        ...current,
        days,
      }

      // Calculate Low values
      if (hasLow && current.low !== undefined) {
        result.low = current.low
        if (previous && previous.low !== undefined) {
          result.lowUsed = current.low - previous.low
          // Calculate percentage: (current used * 100) / previous used
          if (previousPrevious && previousPrevious.low !== undefined) {
            const previousUsed = previous.low - previousPrevious.low
            result.lowPercent =
              previousUsed !== 0
                ? (
                    ((result.lowUsed - previousUsed) / previousUsed) *
                    100
                  ).toFixed(2)
                : "0.00"
          }
        }
      }

      // Calculate Normal values
      if (hasNormal && current.normal !== undefined) {
        result.normal = current.normal
        if (previous && previous.normal !== undefined) {
          result.normalUsed = current.normal - previous.normal
          // Calculate percentage: (current used * 100) / previous used
          if (previousPrevious && previousPrevious.normal !== undefined) {
            const previousUsed = previous.normal - previousPrevious.normal
            result.normalPercent =
              previousUsed !== 0
                ? (
                    ((result.normalUsed - previousUsed) / previousUsed) *
                    100
                  ).toFixed(2)
                : "0.00"
          }
        }
      }

      // Calculate Gas values
      if (hasGas && current.gas !== undefined) {
        result.gas = current.gas
        if (previous && previous.gas !== undefined) {
          result.gasUsed = current.gas - previous.gas
          // Calculate percentage: (current used * 100) / previous used
          if (previousPrevious && previousPrevious.gas !== undefined) {
            const previousUsed = previous.gas - previousPrevious.gas
            result.gasPercent =
              previousUsed !== 0
                ? (
                    ((result.gasUsed - previousUsed) / previousUsed) *
                    100
                  ).toFixed(2)
                : "0.00"
          }
        }
      }

      return result
    },
  )

  // Get color class based on percentage value
  const getPercentColor = (percent: string | undefined) => {
    if (!percent) return ""
    const value = parseFloat(percent)
    if (value < 0) return "bg-green-200" // Economy
    if (value > 20) return "bg-red-200" // High consumption
    if (value > 10) return "bg-orange-100" // Medium-high consumption
    return "bg-yellow-50" // Normal consumption
  }

  const handleOpenEdit = (row: ProcessedReading) => {
    const dateOnly = row.date ? row.date.split("T")[0] : ""
    setEditingRow(row)
    setEditValues({
      date: dateOnly,
      low: row.low !== undefined ? String(row.low) : "",
      normal: row.normal !== undefined ? String(row.normal) : "",
      gas: row.gas !== undefined ? String(row.gas) : "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editingRow) return

    try {
      const updates: Promise<unknown>[] = []
      const dateOnly = editValues.date?.trim() || ""
      const originalDateOnly = editingRow.date.split("T")[0]
      const timePart = editingRow.date.split("T")[1] || "00:00:00"
      const dateChanged = Boolean(dateOnly) && dateOnly !== originalDateOnly
      const nextDate = dateChanged ? `${dateOnly}T${timePart}` : undefined

      if (
        editingRow.lowId &&
        editValues.low !== undefined &&
        editValues.low.trim() !== "" &&
        (Number(editValues.low) !== editingRow.low || dateChanged)
      ) {
        updates.push(
          apiCall(`/api/v1/flat_readings/${editingRow.lowId}`, {
            method: "PATCH",
            body: {
              valor: Number(editValues.low),
              ...(nextDate ? { data: nextDate } : {}),
            },
          }),
        )
      } else if (editingRow.lowId && dateChanged) {
        updates.push(
          apiCall(`/api/v1/flat_readings/${editingRow.lowId}`, {
            method: "PATCH",
            body: { data: nextDate },
          }),
        )
      }

      if (
        editingRow.normalId &&
        editValues.normal !== undefined &&
        editValues.normal.trim() !== "" &&
        (Number(editValues.normal) !== editingRow.normal || dateChanged)
      ) {
        updates.push(
          apiCall(`/api/v1/flat_readings/${editingRow.normalId}`, {
            method: "PATCH",
            body: {
              valor: Number(editValues.normal),
              ...(nextDate ? { data: nextDate } : {}),
            },
          }),
        )
      } else if (editingRow.normalId && dateChanged) {
        updates.push(
          apiCall(`/api/v1/flat_readings/${editingRow.normalId}`, {
            method: "PATCH",
            body: { data: nextDate },
          }),
        )
      }

      if (
        editingRow.gasId &&
        editValues.gas !== undefined &&
        editValues.gas.trim() !== "" &&
        (Number(editValues.gas) !== editingRow.gas || dateChanged)
      ) {
        updates.push(
          apiCall(`/api/v1/flat_readings/${editingRow.gasId}`, {
            method: "PATCH",
            body: {
              valor: Number(editValues.gas),
              ...(nextDate ? { data: nextDate } : {}),
            },
          }),
        )
      } else if (editingRow.gasId && dateChanged) {
        updates.push(
          apiCall(`/api/v1/flat_readings/${editingRow.gasId}`, {
            method: "PATCH",
            body: { data: nextDate },
          }),
        )
      }

      if (updates.length === 0) {
        showErrorToast("No changes detected")
        return
      }

      await Promise.all(updates)
      showSuccessToast("Readings updated successfully")
      queryClient.invalidateQueries({ queryKey: ["flat_readings", flat.id] })
      setEditingRow(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error updating readings"
      showErrorToast(message)
    }
  }

  const handleSendReport = async () => {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      showErrorToast("Invalid date range")
      return
    }
    if (!reportEmail.trim()) {
      showErrorToast("Email is required")
      return
    }

    const filteredRows = processedData.filter((row) =>
      isDateWithinRange(row.date, reportDateFrom, reportDateTo),
    )

    if (filteredRows.length === 0) {
      showErrorToast("No readings found in the selected range")
      return
    }

    const headers = ["Days", "Date"]
    if (hasLow) headers.push("Low", "Low used", "Low %")
    if (hasNormal) headers.push("Normal", "Normal used", "Normal %")
    if (hasGas) headers.push("Gas", "Gas used", "Gas %")

    const rows = filteredRows.map((row, index) => {
      const values: (string | number)[] = [
        index === 0 ? "All" : row.days || "-",
        formatDateToBr(row.date),
      ]
      if (hasLow) {
        values.push(row.low ?? "-")
        values.push(index === 0 ? "All" : (row.lowUsed ?? "-"))
        values.push(index === 0 ? "no data" : (row.lowPercent ?? "-"))
      }
      if (hasNormal) {
        values.push(row.normal ?? "-")
        values.push(index === 0 ? "All" : (row.normalUsed ?? "-"))
        values.push(index === 0 ? "no data" : (row.normalPercent ?? "-"))
      }
      if (hasGas) {
        values.push(row.gas ?? "-")
        values.push(index === 0 ? "All" : (row.gasUsed ?? "-"))
        values.push(index === 0 ? "no data" : (row.gasPercent ?? "-"))
      }
      return values
    })

    const flatNumberLabel = formatFlatNumber(flat.numero, flat.label)
    const reportTitle = `Readings Report - Flat ${flatNumberLabel}`
    const fileName = `readings-flat-${flatNumberLabel}-${new Date().toISOString().slice(0, 10)}.pdf`
    const fileDataBase64 = generatePdfTableReportBase64({
      title: reportTitle,
      dateRange: buildDateRangeLabel(reportDateFrom, reportDateTo),
      headers,
      rows,
    })
    if (!fileDataBase64) {
      showErrorToast("Failed to prepare report file")
      return
    }

    try {
      setIsSendingReport(true)
      await apiCall("/api/v1/utils/send-report-email/", {
        method: "POST",
        body: {
          email_to: reportEmail.trim(),
          subject: reportTitle,
          html_content: buildReadingsReportEmailHtml({
            reportType: "Flat",
            locationLabel: `${flat.building?.nome || "Building"} - ${formatFlatLabel(flat.numero, flat.label)}`,
            periodLabel: buildDateRangeLabel(reportDateFrom, reportDateTo),
          }),
          file_name: fileName,
          file_data_base64: fileDataBase64,
        },
      })
      setShowReportModal(false)
      showSuccessToast("Report sent successfully")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send report by email"
      showErrorToast(message)
    } finally {
      setIsSendingReport(false)
    }
  }

  return (
    <div className="overflow-x-hidden md:overflow-x-auto">
      {/* Flat Header */}
      <div className="relative mb-4 flex items-center justify-between gap-2 rounded-t-lg bg-[#2d8659] p-3 text-white md:p-4">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          disabled={!hasPrevious}
          className={`rounded-full p-2 transition-all duration-200 md:absolute md:left-4 md:top-1/2 md:-translate-y-1/2 ${
            hasPrevious
              ? "bg-white/20 hover:bg-white/30 cursor-pointer"
              : "bg-white/10 cursor-not-allowed opacity-50"
          }`}
          type="button"
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Previous flat</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Flat Info */}
        <div className="flex-1 px-1 text-center md:px-0">
          <h3 className="text-xl font-bold font-['Nunito',sans-serif] sm:text-2xl">
            {formatFlatLabel(flat.numero, flat.label)}
          </h3>
          <p className="mt-1 text-xs sm:text-sm">
            Building: {flat.building?.nome || "N/A"}
          </p>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className={`rounded-full p-2 transition-all duration-200 md:absolute md:right-4 md:top-1/2 md:-translate-y-1/2 ${
            hasNext
              ? "bg-white/20 hover:bg-white/30 cursor-pointer"
              : "bg-white/10 cursor-not-allowed opacity-50"
          }`}
          type="button"
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Next flat</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowReportModal(true)}
          className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] sm:w-auto"
        >
          Generate report
        </button>
      </div>

      <div className="space-y-3 md:hidden">
        {processedData.map((row, index) => (
          <div
            key={`mobile-flat-${row.date}-${index}`}
            className="rounded-lg border border-[#d9d0ca] bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-[#55311c]">
                {formatDateToBr(row.date)}
              </p>
              <p className="text-xs text-[rgba(0,0,0,0.7)]">
                {index === 0 ? "All" : `Days: ${row.days || "-"}`}
              </p>
            </div>
            <div className="space-y-2 text-xs text-[#55311c]">
              {hasLow && (
                <div className="rounded-md bg-[#f7f2ee] p-2">
                  <p className="font-semibold">Low: {row.low ?? "-"}</p>
                  <p className="mt-1">
                    Used: {index === 0 ? "All" : (row.lowUsed ?? "-")}
                  </p>
                  <p className={`mt-1 ${getPercentColor(row.lowPercent)}`}>
                    %: {index === 0 ? "no data" : (row.lowPercent ?? "-")}
                  </p>
                </div>
              )}
              {hasNormal && (
                <div className="rounded-md bg-[#f7f2ee] p-2">
                  <p className="font-semibold">Normal: {row.normal ?? "-"}</p>
                  <p className="mt-1">
                    Used: {index === 0 ? "All" : (row.normalUsed ?? "-")}
                  </p>
                  <p className={`mt-1 ${getPercentColor(row.normalPercent)}`}>
                    %: {index === 0 ? "no data" : (row.normalPercent ?? "-")}
                  </p>
                </div>
              )}
              {hasGas && (
                <div className="rounded-md bg-[#f7f2ee] p-2">
                  <p className="font-semibold">Gas: {row.gas ?? "-"}</p>
                  <p className="mt-1">
                    Used: {index === 0 ? "All" : (row.gasUsed ?? "-")}
                  </p>
                  <p className={`mt-1 ${getPercentColor(row.gasPercent)}`}>
                    %: {index === 0 ? "no data" : (row.gasPercent ?? "-")}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => handleOpenEdit(row)}
                className="w-full rounded-lg bg-[#8c7569] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      <table className="hidden w-full min-w-[840px] border-collapse md:table">
        <thead>
          <tr className="bg-gray-200">
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Days
            </th>
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Date
            </th>
            {hasLow && (
              <>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  Low
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700 italic">
                  used
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  %
                </th>
              </>
            )}
            {hasNormal && (
              <>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  Normal
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700 italic">
                  used
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  %
                </th>
              </>
            )}
            {hasGas && (
              <>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  Gas
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700 italic">
                  used
                </th>
                <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                  %
                </th>
              </>
            )}
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {processedData.map((row, index) => (
            <tr key={row.date} className="hover:bg-gray-50">
              <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                {index === 0 ? "All" : row.days}
              </td>
              <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                {(() => {
                  const dateStr = row.date.split("T")[0]
                  const [y, m, d] = dateStr.split("-")
                  return `${d}/${m}/${y}`
                })()}
              </td>
              {hasLow && (
                <>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                    {row.low ?? "-"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                    {index === 0 ? "All" : (row.lowUsed ?? "-")}
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700 ${getPercentColor(row.lowPercent)}`}
                  >
                    {index === 0 ? "no data" : (row.lowPercent ?? "-")}
                  </td>
                </>
              )}
              {hasNormal && (
                <>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                    {row.normal ?? "-"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                    {index === 0 ? "All" : (row.normalUsed ?? "-")}
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700 ${getPercentColor(row.normalPercent)}`}
                  >
                    {index === 0 ? "no data" : (row.normalPercent ?? "-")}
                  </td>
                </>
              )}
              {hasGas && (
                <>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                    {row.gas ?? "-"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700">
                    {index === 0 ? "All" : (row.gasUsed ?? "-")}
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-700 ${getPercentColor(row.gasPercent)}`}
                  >
                    {index === 0 ? "no data" : (row.gasPercent ?? "-")}
                  </td>
                </>
              )}
              <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(row)}
                  className="rounded-lg bg-[#8c7569] px-3 py-1 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">Edit readings</h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Date: {editingRow.date.split("T")[0]}
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="edit-flat-reading-date"
                >
                  Date
                </label>
                <input
                  type="date"
                  id="edit-flat-reading-date"
                  value={editValues.date || ""}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              {hasLow && (
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="edit-flat-reading-low"
                  >
                    Low
                  </label>
                  <input
                    type="number"
                    id="edit-flat-reading-low"
                    value={editValues.low || ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        low: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              )}

              {hasNormal && (
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="edit-flat-reading-normal"
                  >
                    Normal
                  </label>
                  <input
                    type="number"
                    id="edit-flat-reading-normal"
                    value={editValues.normal || ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        normal: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              )}

              {hasGas && (
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="edit-flat-reading-gas"
                  >
                    Gas
                  </label>
                  <input
                    type="number"
                    id="edit-flat-reading-gas"
                    value={editValues.gas || ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        gas: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] sm:w-auto"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">
              Generate report
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Enter email and date range to send the PDF report.
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="flat-report-email"
                >
                  Email
                </label>
                <input
                  id="flat-report-email"
                  type="email"
                  value={reportEmail}
                  onChange={(e) => setReportEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="flat-report-date-from"
                >
                  Start date
                </label>
                <input
                  id="flat-report-date-from"
                  type="date"
                  value={reportDateFrom}
                  onChange={(e) => setReportDateFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="flat-report-date-to"
                >
                  End date
                </label>
                <input
                  id="flat-report-date-to"
                  type="date"
                  min={reportDateFrom || undefined}
                  value={reportDateTo}
                  onChange={(e) => setReportDateTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendReport}
                disabled={isSendingReport}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] sm:w-auto"
              >
                {isSendingReport ? "Sending..." : "Send by email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function normalizePhoneToE164(
  rawPhone: string | number | null | undefined,
): string | null {
  const defaultCountryCode = "+44"
  if (rawPhone === null || rawPhone === undefined) return null
  const cleaned = String(rawPhone)
    .trim()
    .replace(/[^\d+]/g, "")
  if (!cleaned) return null

  let normalized = cleaned
  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`
  } else if (!normalized.startsWith("+")) {
    const digitsOnly = normalized.replace(/\D/g, "")
    const countryDigits = defaultCountryCode.replace(/\D/g, "") || "44"
    if (digitsOnly.startsWith(countryDigits)) {
      normalized = `+${digitsOnly}`
    } else {
      const localDigits = digitsOnly.startsWith("0")
        ? digitsOnly.slice(1)
        : digitsOnly
      normalized = `+${countryDigits}${localDigits}`
    }
  }

  const e164Regex = /^\+[1-9]\d{8,19}$/
  return e164Regex.test(normalized) ? normalized : null
}

function getResidentRoleLabel(cargo: number): string {
  switch (cargo) {
    case 0:
      return "Owner 1"
    case 1:
      return "Owner 2"
    case 2:
      return "Tenant"
    case 3:
      return "Agent"
    default:
      return "Unknown"
  }
}

function getResidentRoleEditToken(cargo: number): string {
  switch (cargo) {
    case 0:
      return "owner1"
    case 1:
      return "owner2"
    case 2:
      return "tenant"
    case 3:
      return "agent"
    default:
      return "resident"
  }
}

function RemindsContent() {
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    schedule_unit: "week" as ReminderScheduleUnit,
    schedule_mode: "fixed" as ReminderScheduleMode,
    interval_value: "1",
    weekdays: [1] as number[],
    months: [1] as number[],
    is_active: true,
    action_sms: true,
    sms_to: "",
    sms_message: "",
    action_task: false,
    task_title: "",
    task_description: "",
  })

  const { data: remindsData, isLoading } = useQuery<
    ApiListResponse<ReminderItem>
  >({
    queryKey: ["reminds"],
    queryFn: () => apiCall("/api/v1/reminds/"),
  })

  const resetForm = () => {
    setFormData({
      name: "",
      schedule_unit: "week",
      schedule_mode: "fixed",
      interval_value: "1",
      weekdays: [1],
      months: [1],
      is_active: true,
      action_sms: true,
      sms_to: "",
      sms_message: "",
      action_task: false,
      task_title: "",
      task_description: "",
    })
  }

  const handleCancelModal = () => {
    setEditingId(null)
    setShowModal(false)
    resetForm()
  }

  const executeDueMutation = useMutation({
    mutationFn: () =>
      apiCall("/api/v1/reminds/execute-due", {
        method: "POST",
      }) as Promise<ReminderExecutionInfo>,
    onSuccess: (result) => {
      if (result.triggered > 0) {
        showSuccessToast(
          `${result.triggered} reminder(s) triggered today (${result.sms_sent} SMS, ${result.tasks_created} task(s)).`,
        )
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["reminds"] })
    },
  })

  useEffect(() => {
    try {
      const now = Date.now()
      const rawLastRun = localStorage.getItem(REMINDS_EXECUTE_DUE_LAST_RUN_KEY)
      const lastRun = rawLastRun ? Number(rawLastRun) : 0
      if (
        Number.isFinite(lastRun) &&
        now - lastRun < REMINDS_EXECUTE_DUE_COOLDOWN_MS
      ) {
        return
      }
      localStorage.setItem(REMINDS_EXECUTE_DUE_LAST_RUN_KEY, String(now))
      executeDueMutation.mutate()
    } catch {
      executeDueMutation.mutate()
    }
  }, [executeDueMutation.mutate])

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiCall("/api/v1/reminds/", { method: "POST", body: payload }),
    onSuccess: () => {
      showSuccessToast("Reminder created")
      handleCancelModal()
      queryClient.invalidateQueries({ queryKey: ["reminds"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Error creating reminder",
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: Record<string, unknown>
    }) =>
      apiCall(`/api/v1/reminds/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Reminder updated")
      handleCancelModal()
      queryClient.invalidateQueries({ queryKey: ["reminds"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Error updating reminder",
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiCall(`/api/v1/reminds/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      showSuccessToast("Reminder deleted")
      queryClient.invalidateQueries({ queryKey: ["reminds"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Error deleting reminder",
      )
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, nextActive }: { id: string; nextActive: boolean }) =>
      apiCall(`/api/v1/reminds/${id}`, {
        method: "PATCH",
        body: { is_active: nextActive },
      }),
    onSuccess: (_data, variables) => {
      showSuccessToast(
        variables.nextActive ? "Reminder enabled" : "Reminder disabled",
      )
      queryClient.invalidateQueries({ queryKey: ["reminds"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Error toggling reminder",
      )
    },
    onSettled: () => {
      setTogglingId(null)
    },
  })

  const reminders = remindsData?.data || []

  const handleOpenCreateModal = () => {
    setEditingId(null)
    resetForm()
    setShowModal(true)
  }

  const toggleWeekday = (day: number) => {
    setFormData((prev) => {
      const exists = prev.weekdays.includes(day)
      const next = exists
        ? prev.weekdays.filter((item) => item !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b)
      return { ...prev, weekdays: next }
    })
  }

  const toggleMonth = (month: number) => {
    setFormData((prev) => {
      const exists = prev.months.includes(month)
      const next = exists
        ? prev.months.filter((item) => item !== month)
        : [...prev.months, month].sort((a, b) => a - b)
      return { ...prev, months: next }
    })
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!formData.name.trim()) {
      showErrorToast("Reminder name is required")
      return
    }
    if (!formData.action_sms && !formData.action_task) {
      showErrorToast("Select at least one action")
      return
    }
    if (
      formData.schedule_unit === "week" &&
      formData.schedule_mode === "fixed" &&
      formData.weekdays.length === 0
    ) {
      showErrorToast("Select at least one weekday")
      return
    }
    if (
      formData.schedule_unit === "month" &&
      formData.schedule_mode === "fixed" &&
      formData.months.length === 0
    ) {
      showErrorToast("Select at least one month")
      return
    }
    if (
      formData.schedule_mode === "interval" &&
      (!formData.interval_value.trim() ||
        Number(formData.interval_value) < 1 ||
        !Number.isInteger(Number(formData.interval_value)))
    ) {
      showErrorToast("Enter a valid interval number")
      return
    }

    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      schedule_unit: formData.schedule_unit,
      schedule_mode: formData.schedule_mode,
      interval_value:
        formData.schedule_mode === "interval"
          ? Number(formData.interval_value)
          : null,
      weekday_mask:
        formData.schedule_unit === "week"
          ? weekdayMaskFromList(formData.weekdays)
          : 127,
      month_mask:
        formData.schedule_unit === "month" && formData.schedule_mode === "fixed"
          ? monthMaskFromList(formData.months)
          : null,
      is_active: formData.is_active,
      action_sms: formData.action_sms,
      sms_to: formData.sms_to.trim() || null,
      sms_message: formData.sms_message.trim() || null,
      action_task: formData.action_task,
      task_title: formData.task_title.trim() || null,
      task_description: formData.task_description.trim() || null,
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload })
      return
    }
    createMutation.mutate(payload)
  }

  const handleEdit = (reminder: ReminderItem) => {
    setEditingId(String(reminder.id))
    setFormData({
      name: reminder.name || "",
      schedule_unit: (reminder.schedule_unit || "week") as ReminderScheduleUnit,
      schedule_mode: (reminder.schedule_mode ||
        "fixed") as ReminderScheduleMode,
      interval_value: String(reminder.interval_value || 1),
      weekdays: weekdayListFromMask(reminder.weekday_mask),
      months: monthListFromMask(reminder.month_mask),
      is_active: reminder.is_active,
      action_sms: reminder.action_sms,
      sms_to: reminder.sms_to || "",
      sms_message: reminder.sms_message || "",
      action_task: reminder.action_task,
      task_title: reminder.task_title || "",
      task_description: reminder.task_description || "",
    })
    setShowModal(true)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Reminders
            </h2>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Create reminders by day, week, or month to send SMS via Twilio
              and/or create tasks automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c]"
          >
            New reminder
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <h3 className="mb-4 text-xl font-bold text-[#55311c]">Reminder list</h3>
        {isLoading ? (
          <p className="text-sm text-[rgba(0,0,0,0.65)]">
            Loading reminders...
          </p>
        ) : reminders.length === 0 ? (
          <p className="text-sm text-[rgba(0,0,0,0.65)]">No reminders yet.</p>
        ) : (
          <div className="space-y-3">
            {reminders.map((reminder) => (
              <div
                key={String(reminder.id)}
                className="rounded-lg border border-[#e8dfd8] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-lg font-bold text-[#55311c]">
                      {reminder.name}
                    </h4>
                    <p className="text-sm text-[rgba(0,0,0,0.7)]">
                      {formatReminderSchedule(reminder)} -{" "}
                      {reminder.is_active ? "Active" : "Inactive"}
                    </p>
                    <p className="mt-1 text-xs text-[rgba(0,0,0,0.6)]">
                      Actions: {reminder.action_sms ? "SMS" : ""}{" "}
                      {reminder.action_sms && reminder.action_task ? "+" : ""}{" "}
                      {reminder.action_task ? "Task" : ""}
                    </p>
                    {reminder.last_triggered_on && (
                      <p className="text-xs text-[rgba(0,0,0,0.55)]">
                        Last triggered:{" "}
                        {formatDateToBr(reminder.last_triggered_on)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const id = String(reminder.id)
                        setTogglingId(id)
                        toggleActiveMutation.mutate({
                          id,
                          nextActive: !reminder.is_active,
                        })
                      }}
                      disabled={
                        toggleActiveMutation.isPending &&
                        togglingId === String(reminder.id)
                      }
                      className={`rounded px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 ${
                        reminder.is_active
                          ? "bg-amber-600 hover:bg-amber-700"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      {reminder.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(reminder)}
                      className="rounded bg-[#8c7569] px-3 py-1 text-xs font-semibold text-white hover:bg-[#55311c]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(String(reminder.id))}
                      disabled={deleteMutation.isPending}
                      className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-[#55311c]">
                {editingId ? "Edit reminder" : "Create reminder"}
              </h3>
              <button
                type="button"
                onClick={handleCancelModal}
                className="rounded border border-[#d9d0ca] px-3 py-1 text-sm text-[#55311c] hover:bg-[#f5f1ee]"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="remind-name"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Reminder name
                </label>
                <input
                  id="remind-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                  placeholder="Example: Tuesday caretaker check"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="remind-schedule-unit"
                    className="mb-1 block text-sm font-semibold text-[#55311c]"
                  >
                    Frequency unit
                  </label>
                  <select
                    id="remind-schedule-unit"
                    value={formData.schedule_unit}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        schedule_unit: e.target.value as ReminderScheduleUnit,
                      }))
                    }
                    className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="remind-schedule-mode"
                    className="mb-1 block text-sm font-semibold text-[#55311c]"
                  >
                    Frequency type
                  </label>
                  <select
                    id="remind-schedule-mode"
                    value={formData.schedule_mode}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        schedule_mode: e.target.value as ReminderScheduleMode,
                      }))
                    }
                    className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="interval">Interval</option>
                  </select>
                </div>
              </div>

              {formData.schedule_mode === "interval" && (
                <div>
                  <label
                    htmlFor="remind-interval-value"
                    className="mb-1 block text-sm font-semibold text-[#55311c]"
                  >
                    Interval number
                  </label>
                  <input
                    id="remind-interval-value"
                    type="number"
                    min={1}
                    step={1}
                    value={formData.interval_value}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        interval_value: e.target.value,
                      }))
                    }
                    className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                    placeholder="Enter the interval"
                  />
                  <p className="mt-1 text-xs text-[rgba(0,0,0,0.65)]">
                    {formData.schedule_unit === "day" && "Runs every N days."}
                    {formData.schedule_unit === "week" &&
                      "Runs every N weeks on the same weekday the reminder was created."}
                    {formData.schedule_unit === "month" &&
                      "Runs on the first day of every N months."}
                  </p>
                </div>
              )}

              {formData.schedule_unit === "week" &&
                formData.schedule_mode === "fixed" && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[#55311c]">
                      Weekdays
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {weekdayOptions.map((weekday) => {
                        const selected = formData.weekdays.includes(
                          weekday.value,
                        )
                        return (
                          <button
                            key={weekday.value}
                            type="button"
                            onClick={() => toggleWeekday(weekday.value)}
                            className={`rounded border px-3 py-2 text-sm font-semibold transition-all ${
                              selected
                                ? "border-[#8c7569] bg-[#8c7569] text-white"
                                : "border-[#d9d0ca] text-[#55311c] hover:bg-[#f5f1ee]"
                            }`}
                          >
                            {weekday.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1 text-xs text-[rgba(0,0,0,0.65)]">
                      Runs every week on the selected weekdays.
                    </p>
                  </div>
                )}

              {formData.schedule_unit === "month" &&
                formData.schedule_mode === "fixed" && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[#55311c]">
                      Months
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {monthOptions.map((month) => {
                        const selected = formData.months.includes(month.value)
                        return (
                          <button
                            key={month.value}
                            type="button"
                            onClick={() => toggleMonth(month.value)}
                            className={`rounded border px-3 py-2 text-sm font-semibold transition-all ${
                              selected
                                ? "border-[#8c7569] bg-[#8c7569] text-white"
                                : "border-[#d9d0ca] text-[#55311c] hover:bg-[#f5f1ee]"
                            }`}
                          >
                            {month.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1 text-xs text-[rgba(0,0,0,0.65)]">
                      Runs on the first day of the selected months.
                    </p>
                  </div>
                )}

              {formData.schedule_unit === "day" &&
                formData.schedule_mode === "fixed" && (
                  <div className="rounded border border-[#e8dfd8] bg-[#f9f7f5] p-3 text-sm text-[#55311c]">
                    Fixed day reminders run every day.
                  </div>
                )}

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-[#55311c]">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        is_active: e.target.checked,
                      }))
                    }
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-[#55311c]">
                  <input
                    type="checkbox"
                    checked={formData.action_sms}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        action_sms: e.target.checked,
                      }))
                    }
                  />
                  Send SMS
                </label>
                <label className="flex items-center gap-2 text-sm text-[#55311c]">
                  <input
                    type="checkbox"
                    checked={formData.action_task}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        action_task: e.target.checked,
                      }))
                    }
                  />
                  Create task
                </label>
              </div>

              {formData.action_sms && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="remind-sms-to"
                      className="mb-1 block text-sm font-semibold text-[#55311c]"
                    >
                      SMS destination (E.164)
                    </label>
                    <input
                      id="remind-sms-to"
                      type="text"
                      value={formData.sms_to}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          sms_to: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                      placeholder="+447700900123"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="remind-sms-message"
                      className="mb-1 block text-sm font-semibold text-[#55311c]"
                    >
                      SMS message
                    </label>
                    <textarea
                      id="remind-sms-message"
                      value={formData.sms_message}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          sms_message: e.target.value,
                        }))
                      }
                      rows={3}
                      className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                      placeholder="Reminder message text"
                    />
                  </div>
                </div>
              )}

              {formData.action_task && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="remind-task-title"
                      className="mb-1 block text-sm font-semibold text-[#55311c]"
                    >
                      Task title
                    </label>
                    <input
                      id="remind-task-title"
                      type="text"
                      value={formData.task_title}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          task_title: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                      placeholder="Task created by reminder"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="remind-task-description"
                      className="mb-1 block text-sm font-semibold text-[#55311c]"
                    >
                      Task description
                    </label>
                    <textarea
                      id="remind-task-description"
                      value={formData.task_description}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          task_description: e.target.value,
                        }))
                      }
                      rows={3}
                      className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                      placeholder="Additional information for task"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c] disabled:opacity-60"
                >
                  {editingId ? "Save changes" : "Create reminder"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelModal}
                  className="rounded border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] hover:bg-[#f5f1ee]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function TwilioContent() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose")
  const [sendChannel, setSendChannel] = useState<"sms" | "email">("sms")
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([])
  const [selectedResidentIds, setSelectedResidentIds] = useState<string[]>([])
  const [emailSubject, setEmailSubject] = useState("")
  const [messageBody, setMessageBody] = useState("")
  const [emailAttachments, setEmailAttachments] = useState<
    Array<{
      file_name: string
      file_data_base64: string
      mime_type: string
    }>
  >([])
  const [residentSearch, setResidentSearch] = useState("")
  const [residentBuildingFilter, setResidentBuildingFilter] = useState("all")
  const [residentRoleFilter, setResidentRoleFilter] = useState("all")
  const [isSending, setIsSending] = useState(false)
  const [sendReport, setSendReport] = useState<{
    success: number
    failed: number
    skipped: number
    errors: string[]
  } | null>(null)
  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useQuery<ApiListResponse<NotificationHistoryEntry>>({
    queryKey: ["notification-history"],
    enabled: activeTab === "history",
    queryFn: () =>
      apiCall("/api/v1/utils/notification-history/", {
        skip: 0,
        limit: 200,
      }),
  })

  const { data: buildingsData, isLoading: buildingsLoading } = useQuery<
    ApiListResponse<Building>
  >({
    queryKey: ["buildings", "twilio-sms"],
    queryFn: () =>
      apiCall("/api/v1/buildings/condominio", { skip: 0, limit: 100 }),
  })

  const { data: ResidentsData, isLoading: ResidentsLoading } = useQuery<
    Morador[]
  >({
    queryKey: ["Residents", "twilio-sms"],
    queryFn: async () => {
      const allResidents: Morador[] = []
      let skip = 0
      const limit = 100

      while (true) {
        const page = (await apiCall("/api/v1/moradores/", {
          skip,
          limit,
        })) as ApiListResponse<Morador>
        const batch = page.data || []
        allResidents.push(...batch)
        const total = page.count ?? allResidents.length

        if (allResidents.length >= total || batch.length === 0) break
        skip += limit
      }

      return allResidents
    },
  })

  const buildings = buildingsData?.data || []
  const Residents = ResidentsData || []
  const historyRows = historyData?.data || []
  const smsEligibleResidents = useMemo(
    () => Residents.filter((morador) => morador.receives_twilio_sms),
    [Residents],
  )
  const residentsForActiveChannel = useMemo(
    () => (sendChannel === "sms" ? smsEligibleResidents : Residents),
    [Residents, sendChannel, smsEligibleResidents],
  )

  const buildingNameById = useMemo(() => {
    const map = new Map<string, string>()
    buildings.forEach((building) => {
      map.set(String(building.id), building.nome)
    })
    return map
  }, [buildings])

  const filteredResidents = useMemo(() => {
    const search = residentSearch.trim().toLowerCase()
    return residentsForActiveChannel.filter((morador) => {
      if (
        residentBuildingFilter !== "all" &&
        morador.building_nome !== residentBuildingFilter
      ) {
        return false
      }
      if (
        residentRoleFilter !== "all" &&
        String(morador.cargo) !== residentRoleFilter
      ) {
        return false
      }
      if (!search) return true

      const fields = [
        morador.nome,
        morador.building_nome,
        String(morador.flat_numero),
        formatFlatNumber(morador.flat_numero, morador.flat_label),
        morador.mobile ? String(morador.mobile) : "",
        morador.email || "",
      ]
      return fields.some((value) => value.toLowerCase().includes(search))
    })
  }, [
    residentBuildingFilter,
    residentRoleFilter,
    residentSearch,
    residentsForActiveChannel,
  ])

  const recipients = useMemo(() => {
    const residentIdSet = new Set(selectedResidentIds)
    const selectedBuildingNames = new Set(
      selectedBuildingIds
        .map((id) => buildingNameById.get(id))
        .filter((name): name is string => Boolean(name)),
    )

    const selectedMap = new Map<string, Morador>()

    residentsForActiveChannel.forEach((morador) => {
      const id = String(morador.id)
      const includedByResident = residentIdSet.has(id)
      const includedByBuilding = selectedBuildingNames.has(
        morador.building_nome,
      )

      if (includedByResident || includedByBuilding) {
        selectedMap.set(id, morador)
      }
    })

    return Array.from(selectedMap.values()).sort((a, b) => {
      if (a.building_nome !== b.building_nome) {
        return a.building_nome.localeCompare(b.building_nome)
      }
      if (a.flat_numero !== b.flat_numero) {
        return a.flat_numero - b.flat_numero
      }
      const flatLabelCompare = (a.flat_label || "").localeCompare(
        b.flat_label || "",
      )
      if (flatLabelCompare !== 0) return flatLabelCompare
      return a.nome.localeCompare(b.nome)
    })
  }, [
    buildingNameById,
    residentsForActiveChannel,
    selectedBuildingIds,
    selectedResidentIds,
  ])

  const toggleBuilding = (buildingId: string) => {
    setSelectedBuildingIds((prev) =>
      prev.includes(buildingId)
        ? prev.filter((id) => id !== buildingId)
        : [...prev, buildingId],
    )
  }

  const toggleResident = (residentId: string) => {
    setSelectedResidentIds((prev) =>
      prev.includes(residentId)
        ? prev.filter((id) => id !== residentId)
        : [...prev, residentId],
    )
  }

  const selectAllFilteredResidents = () => {
    const ids = filteredResidents.map((morador) => String(morador.id))
    setSelectedResidentIds((prev) => Array.from(new Set([...prev, ...ids])))
  }

  const clearSelections = () => {
    setSelectedBuildingIds([])
    setSelectedResidentIds([])
    setEmailAttachments([])
    setSendReport(null)
  }

  const readFileAsAttachment = async (file: File) => {
    const fileDataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("Could not read file"))
          return
        }
        const base64 = reader.result.split(",", 2)[1]
        if (!base64) {
          reject(new Error("Invalid file data"))
          return
        }
        resolve(base64)
      }
      reader.onerror = () => reject(new Error("Could not read file"))
      reader.readAsDataURL(file)
    })

    return {
      file_name: file.name,
      file_data_base64: fileDataBase64,
      mime_type: file.type || "application/octet-stream",
    }
  }

  const handleAttachmentSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const attachments = await Promise.all(
        Array.from(files).map((file) => readFileAsAttachment(file)),
      )
      setEmailAttachments((prev) => [...prev, ...attachments])
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not read attachment",
      )
    }
  }

  const removeAttachment = (fileName: string, index: number) => {
    setEmailAttachments((prev) =>
      prev.filter(
        (attachment, attachmentIndex) =>
          !(attachment.file_name === fileName && attachmentIndex === index),
      ),
    )
  }

  const sendBulkMessage = async () => {
    const body = messageBody.trim()
    if (!body) {
      showErrorToast(
        sendChannel === "sms"
          ? "Write the message before sending."
          : "Write the email message before sending.",
      )
      return
    }

    if (recipients.length === 0) {
      showErrorToast("Select at least one resident or one building.")
      return
    }

    if (sendChannel === "email" && !emailSubject.trim()) {
      showErrorToast("Write the email subject before sending.")
      return
    }

    setIsSending(true)
    setSendReport(null)

    const errors: string[] = []
    let success = 0
    let failed = 0
    let skipped = 0

    const base = OpenAPI.BASE || "http://localhost:8000"

    for (const recipient of recipients) {
      try {
        let response: Response

        if (sendChannel === "sms") {
          const phoneTo = normalizePhoneToE164(recipient.mobile)
          if (!phoneTo) {
            skipped += 1
            errors.push(
              `${recipient.nome} (${recipient.building_nome} ${formatFlatNumber(recipient.flat_numero, recipient.flat_label)}): invalid phone number`,
            )
            continue
          }

          response = await fetch(`${base}/api/v1/utils/send-sms/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
            body: JSON.stringify({
              phone_to: phoneTo,
              body,
            }),
          })
        } else {
          const emailTo = (recipient.email || "").trim()
          if (!emailTo) {
            skipped += 1
            errors.push(
              `${recipient.nome} (${recipient.building_nome} ${formatFlatNumber(recipient.flat_numero, recipient.flat_label)}): invalid email`,
            )
            continue
          }

          response = await fetch(`${base}/api/v1/utils/send-email/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
            body: JSON.stringify({
              email_to: emailTo,
              subject: emailSubject.trim(),
              html_content: `<p>${body.replace(/\n/g, "<br />")}</p>`,
              attachments: emailAttachments,
            }),
          })
        }

        if (!response.ok) {
          let detail = `HTTP error ${response.status}`
          try {
            const errorPayload = (await response.json()) as {
              detail?: string
              message?: string
            }
            detail = errorPayload.detail || errorPayload.message || detail
          } catch (_error) {
            // ignore parse errors and keep default detail
          }
          throw new Error(detail)
        }

        success += 1
      } catch (error) {
        failed += 1
        errors.push(
          `${recipient.nome} (${recipient.building_nome} ${formatFlatNumber(recipient.flat_numero, recipient.flat_label)}): ${
            error instanceof Error ? error.message : "failed to send"
          }`,
        )
      }
    }

    setIsSending(false)
    setSendReport({ success, failed, skipped, errors })
    queryClient.invalidateQueries({ queryKey: ["notification-history"] })

    if (success > 0) {
      showSuccessToast(
        `${success} ${sendChannel === "sms" ? "SMS" : "email(s)"} sent successfully.`,
      )
    }
    if (failed > 0 || skipped > 0) {
      showErrorToast(
        `Completed with failures: ${failed} failure(s), ${skipped} skipped.`,
      )
    }
  }

  if (buildingsLoading || ResidentsLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md">
          <p className="font-['Nunito',sans-serif] text-[#55311c]">
            Loading messaging data...
          </p>
        </div>
      </div>
    )
  }

  const formatHistoryDate = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleDateString("en-GB")
  }

  const formatHistoryTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatHistoryType = (value: string) =>
    value.toLowerCase() === "sms" ? "SMS" : "Email"

  const formatDeliveryStatus = (value: string) => {
    const normalized = (value || "").trim().toLowerCase()
    if (!normalized) return "-"
    if (normalized === "queued") return "Queued"
    if (normalized === "sent") return "Sent"
    if (normalized === "delivered") return "Delivered"
    if (normalized === "failed") return "Failed"
    if (normalized === "undelivered") return "Undelivered"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Messaging
          </h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex rounded-full bg-[#f5f1ee] p-1">
              <button
                type="button"
                onClick={() => setActiveTab("compose")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  activeTab === "compose"
                    ? "bg-[#8c7569] text-white"
                    : "text-[#55311c] hover:bg-[#ebe4df]"
                }`}
              >
                Compose
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  activeTab === "history"
                    ? "bg-[#8c7569] text-white"
                    : "text-[#55311c] hover:bg-[#ebe4df]"
                }`}
              >
                History
              </button>
            </div>
            {activeTab === "compose" && (
              <div className="flex rounded-full bg-[#f5f1ee] p-1">
                <button
                  type="button"
                  onClick={() => setSendChannel("sms")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    sendChannel === "sms"
                      ? "bg-[#8c7569] text-white"
                      : "text-[#55311c] hover:bg-[#ebe4df]"
                  }`}
                >
                  SMS
                </button>
                <button
                  type="button"
                  onClick={() => setSendChannel("email")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    sendChannel === "email"
                      ? "bg-[#8c7569] text-white"
                      : "text-[#55311c] hover:bg-[#ebe4df]"
                  }`}
                >
                  Email
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === "history" ? (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
                History
              </h3>
              <p className="text-sm text-[rgba(0,0,0,0.65)]">
                SMS and email delivery attempts, including failures.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetchHistory()}
              className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-[#8c7569]">
                  <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                    Date
                  </th>
                  <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                    Time
                  </th>
                  <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                    Type
                  </th>
                  <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                    To
                  </th>
                  <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                    Message
                  </th>
                  <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                    Delivered
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                    >
                      Loading history...
                    </td>
                  </tr>
                )}
                {!historyLoading && historyRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                    >
                      No messages recorded yet.
                    </td>
                  </tr>
                )}
                {!historyLoading &&
                  historyRows.map((entry) => (
                    <tr key={entry.id} className="bg-white hover:bg-[#f8f5f3]">
                      <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                        {formatHistoryDate(entry.created_at)}
                      </td>
                      <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                        {formatHistoryTime(entry.created_at)}
                      </td>
                      <td className="border border-[#e5e0dc] px-3 py-2 text-sm font-semibold text-[#55311c]">
                        {formatHistoryType(entry.notification_type)}
                      </td>
                      <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                        {entry.recipient_to}
                      </td>
                      <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                        <div className="max-w-[420px] whitespace-normal break-words">
                          {entry.message || entry.error_message || "-"}
                        </div>
                      </td>
                      <td className="border border-[#e5e0dc] px-3 py-2 text-sm font-semibold text-[#55311c]">
                        {formatDeliveryStatus(entry.delivery_status)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-6 shadow-md">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
                  Buildings
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedBuildingIds([])}
                  className="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-gray-300"
                >
                  Clear
                </button>
              </div>

              <div className="space-y-2">
                {buildings.map((building) => {
                  const id = String(building.id)
                  const checked = selectedBuildingIds.includes(id)
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-3 rounded border border-[#e8ddd6] px-3 py-2 hover:bg-[#f9f7f5]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBuilding(id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <span className="font-['Nunito',sans-serif] text-[#55311c]">
                        {building.nome}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg bg-white p-6 shadow-md">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
                    Residents
                  </h3>
                  {sendChannel === "sms" && (
                    <p className="text-xs text-[rgba(0,0,0,0.6)]">
                      Only residents with Twilio SMS enabled are shown for SMS
                      sending.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllFilteredResidents}
                    className="rounded bg-[#8c7569] px-3 py-1 text-xs font-semibold text-white hover:bg-[#55311c]"
                  >
                    Select filtered
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedResidentIds([])}
                    className="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-gray-300"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <input
                value={residentSearch}
                onChange={(e) => setResidentSearch(e.target.value)}
                placeholder="Search by name, building, flat, phone or email"
                className="mb-3 w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />

              <div className="mb-3 grid gap-2 md:grid-cols-2">
                <select
                  value={residentBuildingFilter}
                  onChange={(e) => setResidentBuildingFilter(e.target.value)}
                  className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="all">All buildings</option>
                  {buildings
                    .map((building) => building.nome)
                    .sort((a, b) => a.localeCompare(b))
                    .map((buildingName) => (
                      <option key={buildingName} value={buildingName}>
                        {buildingName}
                      </option>
                    ))}
                </select>

                <select
                  value={residentRoleFilter}
                  onChange={(e) => setResidentRoleFilter(e.target.value)}
                  className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="all">All roles</option>
                  <option value="0">Owner 1</option>
                  <option value="1">Owner 2</option>
                  <option value="2">Tenant</option>
                  <option value="3">Agent</option>
                </select>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-2">
                {filteredResidents.map((morador) => {
                  const id = String(morador.id)
                  const checked = selectedResidentIds.includes(id)
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-3 rounded border border-[#e8ddd6] px-3 py-2 hover:bg-[#f9f7f5]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleResident(id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]">
                          {morador.nome}
                        </p>
                        <p className="truncate text-xs text-[rgba(0,0,0,0.65)]">
                          {getResidentRoleLabel(morador.cargo)} |{" "}
                          {morador.building_nome}{" "}
                          {formatFlatNumber(
                            morador.flat_numero,
                            morador.flat_label,
                          )}{" "}
                          |{" "}
                          {sendChannel === "sms"
                            ? morador.mobile || "no phone"
                            : morador.email || "no email"}
                        </p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded border border-[#e8ddd6] bg-[#f9f7f5] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8c7569]">
                  Selected buildings
                </p>
                <p className="text-2xl font-bold text-[#55311c]">
                  {selectedBuildingIds.length}
                </p>
              </div>
              <div className="rounded border border-[#e8ddd6] bg-[#f9f7f5] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8c7569]">
                  Selected residents
                </p>
                <p className="text-2xl font-bold text-[#55311c]">
                  {selectedResidentIds.length}
                </p>
              </div>
              <div className="rounded border border-[#e8ddd6] bg-[#f9f7f5] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8c7569]">
                  Final recipients
                </p>
                <p className="text-2xl font-bold text-[#55311c]">
                  {recipients.length}
                </p>
              </div>
            </div>

            {sendChannel === "email" && (
              <>
                <label
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                  htmlFor="twilio-email-subject"
                >
                  Subject
                </label>
                <input
                  id="twilio-email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject"
                  className="mb-4 w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </>
            )}

            <label
              className="mb-1 block text-sm font-semibold text-[#55311c]"
              htmlFor="twilio-message-body"
            >
              {sendChannel === "sms" ? "Message" : "Email body"}
            </label>
            <textarea
              id="twilio-message-body"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={5}
              maxLength={sendChannel === "sms" ? 1600 : undefined}
              placeholder={
                sendChannel === "sms"
                  ? "Type your message..."
                  : "Type your email message..."
              }
              className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
            <p className="mt-1 text-xs text-[rgba(0,0,0,0.6)]">
              {sendChannel === "sms"
                ? `${messageBody.length}/1600 characters`
                : `${messageBody.length} characters`}
            </p>

            {sendChannel === "email" && (
              <div className="mt-4">
                <input
                  id="twilio-email-attachments"
                  type="file"
                  multiple
                  onChange={(e) => handleAttachmentSelection(e.target.files)}
                  className="hidden"
                />
                <label
                  htmlFor="twilio-email-attachments"
                  className="inline-flex cursor-pointer rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c]"
                >
                  Add files
                </label>
                <p className="mt-2 text-xs text-[rgba(0,0,0,0.6)]">
                  Attachments are enabled for email sending.
                </p>
                {emailAttachments.length > 0 && (
                  <div className="mt-3 space-y-2 rounded border border-[#e8ddd6] bg-[#f9f7f5] p-3">
                    {emailAttachments.map((attachment, index) => (
                      <div
                        key={`${attachment.file_name}-${index}`}
                        className="flex items-center justify-between gap-3 rounded bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#55311c]">
                            {attachment.file_name}
                          </p>
                          <p className="text-xs text-[rgba(0,0,0,0.6)]">
                            {attachment.mime_type}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            removeAttachment(attachment.file_name, index)
                          }
                          className="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-gray-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sendBulkMessage}
                disabled={isSending}
                className="rounded bg-[#8c7569] px-5 py-2 font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSending
                  ? "Sending..."
                  : sendChannel === "sms"
                    ? "Send bulk SMS"
                    : "Send bulk email"}
              </button>
              <button
                type="button"
                onClick={clearSelections}
                disabled={isSending}
                className="rounded bg-gray-200 px-5 py-2 font-semibold text-[#55311c] hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear selection
              </button>
            </div>

            {sendReport && (
              <div className="mt-6 rounded border border-[#e8ddd6] bg-[#f9f7f5] p-4">
                <h4 className="font-['Nunito',sans-serif] text-lg font-bold text-[#55311c]">
                  Send result
                </h4>
                <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
                  {sendReport.success} success(es), {sendReport.failed}{" "}
                  failure(s), {sendReport.skipped} skipped.
                </p>

                {sendReport.errors.length > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto rounded bg-white p-3">
                    <ul className="space-y-1 text-xs text-[#55311c]">
                      {sendReport.errors.map((error, index) => (
                        <li key={`${error}-${index}`}>- {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BinsQrCodesContent() {
  const { data: buildingsData, isLoading } = useQuery({
    queryKey: ["buildings", "qr-bins"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = (buildingsData?.data || []) as Building[]
  const defaultBuilding = useMemo(
    () =>
      [...buildings].find(
        (building) => !building.nome.toLowerCase().includes("office"),
      ) || null,
    [buildings],
  )

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.location.origin
  }, [])

  const [qrData, setQrData] = useState<{
    dataUrl: string
    link: string
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    let isActive = true

    const generateQRCode = async () => {
      if (!baseUrl || !defaultBuilding) {
        setQrData(null)
        return
      }
      setIsGenerating(true)

      const params = new URLSearchParams()
      params.set("buildingId", String(defaultBuilding.id))
      params.set("buildingName", String(defaultBuilding.nome))
      const link = `${baseUrl}/bins-access?${params.toString()}`
      const dataUrl = await QRCode.toDataURL(link, { width: 280, margin: 1 })

      if (!isActive) return
      setQrData({ dataUrl, link })
      setIsGenerating(false)
    }

    generateQRCode().catch(() => {
      if (!isActive) return
      setQrData(null)
      setIsGenerating(false)
    })

    return () => {
      isActive = false
    }
  }, [baseUrl, defaultBuilding])

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          Bin Report
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          Single QR Code for miss collection reporting.
        </p>
      </div>

      {(isLoading || isGenerating) && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Generating QR Codes...
        </div>
      )}

      {!isLoading && !defaultBuilding && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          No building found.
        </div>
      )}

      {defaultBuilding && (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <div className="mb-4">
            <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
              MISS COLLECTION
            </h3>
            <p className="text-sm text-[rgba(0,0,0,0.65)]">
              Use this QR code to report missed bin collections.
            </p>
          </div>

          <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
            {qrData ? (
              <img
                src={qrData.dataUrl}
                alt="QR Code - Miss Collection"
                className="h-64 w-64"
              />
            ) : (
              <p className="text-sm text-[rgba(0,0,0,0.6)]">Generating...</p>
            )}
          </div>

          {qrData && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <a
                href={qrData.dataUrl}
                download="qr-miss-collection.png"
                className="block rounded-lg bg-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
              >
                Download PNG
              </a>
              <a
                href={qrData.link}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
              >
                Open link
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BinsContent() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [page, setPage] = useState(0)
  const [typeFilter, setTypeFilter] = useState<"" | "general" | "recycle">("")
  const [statusFilter, setStatusFilter] = useState<"" | "miss" | "late">("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const pageSize = 20

  const filterParams = useMemo(
    () => ({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      collection_type: typeFilter || undefined,
      collection_status: statusFilter || undefined,
    }),
    [dateFrom, dateTo, typeFilter, statusFilter],
  )

  const { data, isLoading, error } = useQuery<
    ApiListResponse<BinMissCollectionRecord>
  >({
    queryKey: ["bins", page, pageSize, filterParams],
    queryFn: () =>
      apiCall("/api/v1/bins/", {
        skip: page * pageSize,
        limit: pageSize,
        ...filterParams,
      }),
    placeholderData: keepPreviousData,
  })

  const { data: allData } = useQuery<ApiListResponse<BinMissCollectionRecord>>({
    queryKey: ["bins", "all-for-alert", typeFilter],
    queryFn: () =>
      apiCall("/api/v1/bins/", {
        skip: 0,
        limit: 1000,
        collection_type: typeFilter || undefined,
      }),
  })

  const items = data?.data || []
  const count = data?.count || 0
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const allItems = allData?.data || []

  const formatDate = (value: string) => {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return "-"
    return dt.toLocaleDateString("en-GB")
  }

  const formatTime = (value: string) => {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return "-"
    return dt.toLocaleTimeString("en-GB")
  }

  const formatCsvValue = (value: string | number | boolean) => {
    const text = String(value).replace(/"/g, '""')
    return `"${text}"`
  }

  const oldMissAlerts = useMemo(() => {
    const sorted = [...allItems].sort(
      (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
    )
    const openByType: Record<"general" | "recycle", string[]> = {
      general: [],
      recycle: [],
    }

    sorted.forEach((item) => {
      const key = item.collection_type === "recycle" ? "recycle" : "general"
      if (item.collection_status === "miss") openByType[key].push(item.data)
      if (item.collection_status === "late" && openByType[key].length > 0) {
        openByType[key].shift()
      }
    })

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return (["general", "recycle"] as const)
      .map((type) => {
        const olderDates = openByType[type].filter(
          (date) => new Date(date).getTime() < sevenDaysAgo,
        )
        if (olderDates.length === 0) return null
        return {
          type,
          count: olderDates.length,
          oldest: olderDates[0],
        }
      })
      .filter(Boolean) as Array<{
      type: "general" | "recycle"
      count: number
      oldest: string
    }>
  }, [allItems])

  const handleDownloadReport = async () => {
    setIsDownloadingReport(true)
    try {
      const firstPage = (await apiCall("/api/v1/bins/", {
        skip: 0,
        limit: 1,
        ...filterParams,
      })) as ApiListResponse<BinMissCollectionRecord>

      const total = firstPage.count || 0
      if (!total) {
        showErrorToast("No results to generate the report.")
        return
      }

      const fullResult = (await apiCall("/api/v1/bins/", {
        skip: 0,
        limit: total,
        ...filterParams,
      })) as ApiListResponse<BinMissCollectionRecord>

      const lines = [
        ["Date", "Time", "Type", "Status", "Building"].join(","),
        ...fullResult.data.map((item) =>
          [
            formatCsvValue(formatDate(item.data)),
            formatCsvValue(formatTime(item.data)),
            formatCsvValue(item.collection_type),
            formatCsvValue(item.collection_status),
            formatCsvValue(item.building_nome),
          ].join(","),
        ),
      ]
      const csv = `\uFEFF${lines.join("\n")}`
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      const day = new Date().toISOString().slice(0, 10)
      link.href = href
      link.download = `bins-report-${day}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(href)
      showSuccessToast("Report generated successfully.")
    } catch {
      showErrorToast("Failed to generate report.")
    } finally {
      setIsDownloadingReport(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Loading bins records...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-red-700">Error loading bins records.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Bins
            </h2>
            <p className="mt-2 text-[rgba(0,0,0,0.7)]">
              Weekly schedule: General on Tuesdays and Thursdays. Recycle on
              Thursday.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={isDownloadingReport}
            className="rounded bg-[#8c7569] px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#55311c]"
          >
            {isDownloadingReport ? "Generating..." : "Download report"}
          </button>
        </div>
      </div>

      {oldMissAlerts.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4 shadow-md">
          <p className="font-semibold text-yellow-800">
            Old miss collections pending late collection:
          </p>
          <div className="mt-2 space-y-1 text-sm text-yellow-700">
            {oldMissAlerts.map((alert) => (
              <p key={`${alert.type}-${alert.oldest}`}>
                {alert.type === "general" ? "General" : "Recycle"}:{" "}
                {alert.count} pending (oldest: {formatDate(alert.oldest)})
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <div>
            <label
              htmlFor="bins-type-filter"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              Type
            </label>
            <select
              id="bins-type-filter"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as "" | "general" | "recycle")
                setPage(0)
              }}
              className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
            >
              <option value="">All</option>
              <option value="general">General</option>
              <option value="recycle">Recycle</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="bins-status-filter"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              Status
            </label>
            <select
              id="bins-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "" | "miss" | "late")
                setPage(0)
              }}
              className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
            >
              <option value="">All</option>
              <option value="miss">Miss Collection</option>
              <option value="late">Late Collection</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="bins-date-from"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              Start date
            </label>
            <input
              id="bins-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(0)
              }}
              className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="bins-date-to"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              End date
            </label>
            <input
              id="bins-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(0)
              }}
              className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Date
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Time
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Type
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.id)} className="hover:bg-[#f5f1ee]">
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {formatDate(item.data)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {formatTime(item.data)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {item.collection_type === "recycle" ? "Recycle" : "General"}
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {item.collection_status === "late"
                      ? "Late Collection"
                      : "Miss Collection"}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="border border-gray-300 px-4 py-8 text-center text-[rgba(0,0,0,0.65)]"
                  >
                    No miss collection records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-[#55311c]">
            Showing {items.length} of {count} record(s)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#55311c]"
            >
              Previous
            </button>
            <span className="flex items-center px-3 text-sm text-[#55311c]">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#55311c]"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CleanerQrCodesContent() {
  const { data: buildingsData, isLoading } = useQuery({
    queryKey: ["buildings", "qr-cleaner"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = (buildingsData?.data || []) as Building[]

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.location.origin
  }, [])

  const [qrMap, setQrMap] = useState<
    Record<string, { dataUrl: string; link: string }>
  >({})
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    let isActive = true

    const generateQRCodes = async () => {
      if (!baseUrl || buildings.length === 0) {
        setQrMap({})
        return
      }

      setIsGenerating(true)

      const entries = await Promise.all(
        buildings.map(async (building) => {
          const params = new URLSearchParams()
          params.set("buildingId", String(building.id))
          if (building.nome) {
            params.set("buildingName", String(building.nome))
          }
          const link = `${baseUrl}/cleaner-access?${params.toString()}`
          const dataUrl = await QRCode.toDataURL(link, {
            width: 240,
            margin: 1,
          })
          return [String(building.id), { dataUrl, link }] as const
        }),
      )

      if (!isActive) return

      setQrMap(Object.fromEntries(entries))
      setIsGenerating(false)
    }

    generateQRCodes().catch(() => {
      if (!isActive) return
      setQrMap({})
      setIsGenerating(false)
    })

    return () => {
      isActive = false
    }
  }, [baseUrl, buildings])

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          QR Code - Cleaner
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          Download one QR code per building to register access in the Cleaner
          panel.
        </p>
      </div>

      {(isLoading || isGenerating) && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Generating QR Codes...
        </div>
      )}

      {!isLoading && buildings.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          No building found.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[...buildings]
          .filter((building) => !building.nome.toLowerCase().includes("office"))
          .map((building) => {
            const qrItem = qrMap[String(building.id)]
            return (
              <div
                key={building.id}
                className="flex h-full flex-col justify-between rounded-lg bg-white p-6 shadow-md"
              >
                <div>
                  <h3 className="text-lg font-semibold text-[#55311c]">
                    {building.nome || "Building"}
                  </h3>
                </div>

                <div className="mt-4 flex flex-col items-center justify-center gap-4">
                  {qrItem?.dataUrl ? (
                    <img
                      src={qrItem.dataUrl}
                      alt={`QR Code ${building.nome || building.id}`}
                      className="h-48 w-48 rounded-lg border border-[#e5e0dc] bg-white p-2"
                    />
                  ) : (
                    <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-[#e5e0dc] text-xs text-[rgba(0,0,0,0.6)]">
                      QR Code unavailable
                    </div>
                  )}

                  <div className="flex w-full flex-col gap-2">
                    <a
                      href={qrItem?.dataUrl || "#"}
                      download={`qr-cleaner-${building.nome || building.id}.png`}
                      className={`w-full rounded-lg px-4 py-2 text-center text-sm font-semibold transition-all duration-200 ${
                        qrItem?.dataUrl
                          ? "bg-[#8c7569] text-white hover:bg-[#55311c]"
                          : "cursor-not-allowed bg-[#e5e0dc] text-[#8c7569]"
                      }`}
                      onClick={(event) => {
                        if (!qrItem?.dataUrl) event.preventDefault()
                      }}
                    >
                      Download QR Code
                    </a>
                    {qrItem?.link && (
                      <a
                        href={qrItem.link}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
                      >
                        Open link
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function ContractorsContent() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false)
  const [selectedVisit, setSelectedVisit] =
    useState<ContractorVisitAdmin | null>(null)
  const [mediaForm, setMediaForm] = useState<ContractorMediaFormState>({
    mediaName: "",
    mediaData: null,
  })
  const deferredSearch = useDeferredValue(search.trim())

  const { data, isLoading } = useQuery<ApiListResponse<ContractorVisitAdmin>>({
    queryKey: ["contractor-visits", deferredSearch, dateFrom, dateTo],
    queryFn: () =>
      apiCall("/api/v1/contractor-access/", {
        skip: 0,
        limit: 200,
        search: deferredSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const visits = data?.data || []
  const totalVisits = data?.count || visits.length

  const contractorMediaMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: EntityId
      payload: Record<string, string | null>
    }) =>
      apiCall(`/api/v1/contractor-access/${id}/media`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Contractor media updated successfully")
      setIsMediaDialogOpen(false)
      setSelectedVisit(null)
      setMediaForm({ mediaName: "", mediaData: null })
      queryClient.invalidateQueries({ queryKey: ["contractor-visits"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Could not update contractor media",
      )
    },
  })

  const handleMediaDialogChange = (open: boolean) => {
    setIsMediaDialogOpen(open)
    if (!open) {
      setSelectedVisit(null)
      setMediaForm({ mediaName: "", mediaData: null })
    }
  }

  const handleOpenMediaDialog = (visit: ContractorVisitAdmin) => {
    setSelectedVisit(visit)
    setMediaForm({
      mediaName: visit.extra_media_name || "",
      mediaData: visit.extra_media_data || null,
    })
    setIsMediaDialogOpen(true)
  }

  const handleMediaFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setMediaForm({
        mediaName: file.name,
        mediaData: dataUrl,
      })
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not read media",
      )
    } finally {
      event.target.value = ""
    }
  }

  const handleSaveMedia = () => {
    if (!selectedVisit) return

    contractorMediaMutation.mutate({
      id: selectedVisit.id,
      payload: {
        extra_media_name: mediaForm.mediaData
          ? mediaForm.mediaName.trim() || "contractor-media"
          : null,
        extra_media_data: mediaForm.mediaData || null,
      },
    })
  }

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "-"
    return parsed.toLocaleDateString("en-GB")
  }

  const formatTime = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "-"
    return parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Contractors
            </h2>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Review contractor check-in records and attach one extra media file
              for internal follow-up.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="contractor-search"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Search
              </label>
              <input
                id="contractor-search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, company, building or job"
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="contractor-date-from"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date from
              </label>
              <input
                id="contractor-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="contractor-date-to"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date to
              </label>
              <input
                id="contractor-date-to"
                type="date"
                min={dateFrom || undefined}
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-[rgba(0,0,0,0.6)]">
          Showing {totalVisits} contractor record(s).
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Date
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Time IN
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Time OUT
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Name
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Company
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Building
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Job description
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Mobile
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Photo
                </th>
                <th className="border border-[#736055] px-3 py-2 text-center text-sm font-semibold text-white">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={10}
                    className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    Loading contractor records...
                  </td>
                </tr>
              )}
              {!isLoading && visits.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    No contractor records found.
                  </td>
                </tr>
              )}
              {!isLoading &&
                visits.map((visit) => (
                  <tr key={visit.id} className="bg-white hover:bg-[#f8f5f3]">
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatDate(visit.in_at)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatTime(visit.in_at)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatTime(visit.out_at)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {visit.name}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {visit.company}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {visit.building_name}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {visit.job_description}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {visit.mobile}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {visit.extra_media_data ? (
                        <div className="flex flex-col gap-2">
                          {isImageDataUrl(visit.extra_media_data) && (
                            <img
                              src={visit.extra_media_data}
                              alt={visit.extra_media_name || "Contractor media"}
                              className="h-16 w-16 rounded border border-[#d9d0ca] object-cover"
                            />
                          )}
                          <a
                            href={visit.extra_media_data}
                            download={
                              visit.extra_media_name || "contractor-media"
                            }
                            className="text-xs font-semibold text-[#8c7569] underline"
                          >
                            {visit.extra_media_name || "Download media"}
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-[rgba(0,0,0,0.55)]">
                          No media
                        </span>
                      )}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm">
                      <button
                        type="button"
                        onClick={() => handleOpenMediaDialog(visit)}
                        className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                      >
                        {visit.extra_media_data ? "Edit media" : "Add media"}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isMediaDialogOpen} onOpenChange={handleMediaDialogChange}>
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              Contractor extra media
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Attach one internal media file to this contractor record.
            </DialogDescription>
          </DialogHeader>

          {selectedVisit && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4 text-sm text-[#55311c]">
                <p>
                  <span className="font-semibold">Contractor:</span>{" "}
                  {selectedVisit.name}
                </p>
                <p>
                  <span className="font-semibold">Company:</span>{" "}
                  {selectedVisit.company}
                </p>
                <p>
                  <span className="font-semibold">Building:</span>{" "}
                  {selectedVisit.building_name}
                </p>
              </div>

              <div>
                <label
                  htmlFor="contractor-extra-media-name"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Media name
                </label>
                <input
                  id="contractor-extra-media-name"
                  type="text"
                  value={mediaForm.mediaName}
                  onChange={(event) =>
                    setMediaForm((previous) => ({
                      ...previous,
                      mediaName: event.target.value,
                    }))
                  }
                  placeholder="Enter a media name"
                  className="w-full rounded border border-[#d9d0ca] bg-white px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="contractor-extra-media-file"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Media file
                </label>
                <input
                  id="contractor-extra-media-file"
                  type="file"
                  onChange={handleMediaFileChange}
                  className="block w-full text-sm text-[#55311c] file:mr-4 file:rounded file:border-0 file:bg-[#8c7569] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#55311c]"
                />
              </div>

              {mediaForm.mediaData && (
                <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#55311c]">
                      Current media preview
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setMediaForm({
                          mediaName: "",
                          mediaData: null,
                        })
                      }
                      className="rounded border border-[#d9d0ca] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                    >
                      Remove media
                    </button>
                  </div>

                  {isImageDataUrl(mediaForm.mediaData) ? (
                    <img
                      src={mediaForm.mediaData}
                      alt={mediaForm.mediaName || "Contractor media"}
                      className="max-h-72 rounded border border-[#d9d0ca] object-contain"
                    />
                  ) : (
                    <a
                      href={mediaForm.mediaData}
                      download={mediaForm.mediaName || "contractor-media"}
                      className="text-sm font-semibold text-[#8c7569] underline"
                    >
                      Download current media
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => handleMediaDialogChange(false)}
              className="rounded border border-[#d9d0ca] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveMedia}
              disabled={contractorMediaMutation.isPending}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {contractorMediaMutation.isPending ? "Saving..." : "Save media"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ContractorQrCodesContent() {
  const { user } = useAuth()

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.location.origin
  }, [])

  const [qrItem, setQrItem] = useState<{
    dataUrl: string
    link: string
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    let isActive = true

    const generateQRCode = async () => {
      if (!baseUrl || !user?.condominio_id) {
        setQrItem(null)
        return
      }

      setIsGenerating(true)

      const params = new URLSearchParams()
      params.set("condominioId", String(user.condominio_id))
      const link = `${baseUrl}/contractor-access?${params.toString()}`
      const dataUrl = await QRCode.toDataURL(link, {
        width: 240,
        margin: 1,
      })

      if (!isActive) return

      setQrItem({ dataUrl, link })
      setIsGenerating(false)
    }

    generateQRCode().catch(() => {
      if (!isActive) return
      setQrItem(null)
      setIsGenerating(false)
    })

    return () => {
      isActive = false
    }
  }, [baseUrl, user?.condominio_id])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          QR Code - Contractor
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          Single QR code for contractor check in and check out.
        </p>
      </div>

      {isGenerating && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Generating QR Code...
        </div>
      )}

      {!user?.condominio_id && !isGenerating && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          User is not linked to a condominio.
        </div>
      )}

      {user?.condominio_id && !isGenerating && (
        <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-md">
          <div className="flex flex-col items-center justify-center gap-4">
            {qrItem?.dataUrl ? (
              <img
                src={qrItem.dataUrl}
                alt="QR Code Contractor"
                className="h-56 w-56 rounded-lg border border-[#e5e0dc] bg-white p-2"
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-[#e5e0dc] text-xs text-[rgba(0,0,0,0.6)]">
                QR Code unavailable
              </div>
            )}

            <div className="flex w-full flex-col gap-2">
              <a
                href={qrItem?.dataUrl || "#"}
                download="qr-contractor.png"
                className={`w-full rounded-lg px-4 py-2 text-center text-sm font-semibold transition-all duration-200 ${
                  qrItem?.dataUrl
                    ? "bg-[#8c7569] text-white hover:bg-[#55311c]"
                    : "cursor-not-allowed bg-[#e5e0dc] text-[#8c7569]"
                }`}
                onClick={(event) => {
                  if (!qrItem?.dataUrl) event.preventDefault()
                }}
              >
                Download QR Code
              </a>
              {qrItem?.link && (
                <a
                  href={qrItem.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
                >
                  Open link
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CaretakerQrCodesContent() {
  const { data: buildingsData, isLoading } = useQuery({
    queryKey: ["buildings", "qr-caretaker"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = (buildingsData?.data || []) as Building[]

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.location.origin
  }, [])

  const [qrMap, setQrMap] = useState<
    Record<string, { dataUrl: string; link: string }>
  >({})
  const [isGenerating, setIsGenerating] = useState(false)
  const binsBuildings = useMemo(
    () =>
      [...buildings].filter(
        (building) => !building.nome.toLowerCase().includes("office"),
      ),
    [buildings],
  )

  useEffect(() => {
    let isActive = true

    const generateQRCodes = async () => {
      if (!baseUrl || buildings.length === 0) {
        setQrMap({})
        return
      }

      setIsGenerating(true)

      const entries = await Promise.all(
        [
          {
            key: "work-time",
            link: `${baseUrl}/caretaker-access?mode=work-time`,
          },
          ...binsBuildings.map((building) => {
            const params = new URLSearchParams()
            params.set("buildingId", String(building.id))
            if (building.nome) params.set("buildingName", String(building.nome))
            return {
              key: String(building.id),
              link: `${baseUrl}/caretaker-access?${params.toString()}`,
            }
          }),
        ].map(async (entry) => {
          const dataUrl = await QRCode.toDataURL(entry.link, {
            width: 240,
            margin: 1,
          })
          return [entry.key, { dataUrl, link: entry.link }] as const
        }),
      )

      if (!isActive) return

      setQrMap(Object.fromEntries(entries))
      setIsGenerating(false)
    }

    generateQRCodes().catch(() => {
      if (!isActive) return
      setQrMap({})
      setIsGenerating(false)
    })

    return () => {
      isActive = false
    }
  }, [baseUrl, buildings, binsBuildings])

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          QR Code - Caretaker
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          QR codes for WORK TIME and building sessions.
        </p>
      </div>

      {(isLoading || isGenerating) && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Generating QR Codes...
        </div>
      )}

      {!isLoading && binsBuildings.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          No building found.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div
          key="work-time-card"
          className="flex h-full flex-col justify-between rounded-lg bg-white p-6 shadow-md"
        >
          <div>
            <h3 className="text-lg font-semibold text-[#55311c]">WORK TIME</h3>
            <p className="text-sm text-[rgba(0,0,0,0.6)]">Caretaker IN/OUT</p>
          </div>

          <div className="mt-4 flex flex-col items-center justify-center gap-4">
            {qrMap["work-time"]?.dataUrl ? (
              <img
                src={qrMap["work-time"].dataUrl}
                alt="QR Code WORK TIME"
                className="h-48 w-48 rounded-lg border border-[#e5e0dc] bg-white p-2"
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-[#e5e0dc] text-xs text-[rgba(0,0,0,0.6)]">
                QR Code unavailable
              </div>
            )}

            <div className="flex w-full flex-col gap-2">
              <a
                href={qrMap["work-time"]?.dataUrl || "#"}
                download="qr-work-time.png"
                className={`w-full rounded-lg px-4 py-2 text-center text-sm font-semibold transition-all duration-200 ${
                  qrMap["work-time"]?.dataUrl
                    ? "bg-[#8c7569] text-white hover:bg-[#55311c]"
                    : "cursor-not-allowed bg-[#e5e0dc] text-[#8c7569]"
                }`}
                onClick={(event) => {
                  if (!qrMap["work-time"]?.dataUrl) event.preventDefault()
                }}
              >
                Download QR Code
              </a>
              {qrMap["work-time"]?.link && (
                <a
                  href={qrMap["work-time"].link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
                >
                  Open link
                </a>
              )}
            </div>
          </div>
        </div>

        {binsBuildings.map((building) => {
          const qrItem = qrMap[String(building.id)]
          return (
            <div
              key={building.id}
              className="flex h-full flex-col justify-between rounded-lg bg-white p-6 shadow-md"
            >
              <div>
                <h3 className="text-lg font-semibold text-[#55311c]">
                  {building.nome || "Building"}
                </h3>
                <p className="text-sm text-[rgba(0,0,0,0.6)]">
                  Caretaker building session
                </p>
              </div>

              <div className="mt-4 flex flex-col items-center justify-center gap-4">
                {qrItem?.dataUrl ? (
                  <img
                    src={qrItem.dataUrl}
                    alt={`QR Code ${building.nome || building.id}`}
                    className="h-48 w-48 rounded-lg border border-[#e5e0dc] bg-white p-2"
                  />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-[#e5e0dc] text-xs text-[rgba(0,0,0,0.6)]">
                    QR Code unavailable
                  </div>
                )}

                <div className="flex w-full flex-col gap-2">
                  <a
                    href={qrItem?.dataUrl || "#"}
                    download={`qr-caretaker-${building.nome || building.id}.png`}
                    className={`w-full rounded-lg px-4 py-2 text-center text-sm font-semibold transition-all duration-200 ${
                      qrItem?.dataUrl
                        ? "bg-[#8c7569] text-white hover:bg-[#55311c]"
                        : "cursor-not-allowed bg-[#e5e0dc] text-[#8c7569]"
                    }`}
                    onClick={(event) => {
                      if (!qrItem?.dataUrl) event.preventDefault()
                    }}
                  >
                    Download QR Code
                  </a>
                  {qrItem?.link && (
                    <a
                      href={qrItem.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
                    >
                      Open link
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CleanerContent() {
  const [activeSubTab, setActiveSubTab] = useState<"summary" | "register">(
    "summary",
  )

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Cleaner
            </h2>
            <p className="mt-1 text-[rgba(0,0,0,0.7)]">
              Work summary and cleaner registration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab("summary")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                activeSubTab === "summary"
                  ? "bg-[#8c7569] text-white"
                  : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("register")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                activeSubTab === "register"
                  ? "bg-[#8c7569] text-white"
                  : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
              }`}
            >
              Registration
            </button>
          </div>
        </div>
      </div>

      {activeSubTab === "summary" ? <CleanerSummary /> : <CleanerRegister />}
    </div>
  )
}

function CaretakerContent() {
  const [activeSubTab, setActiveSubTab] = useState<
    "summary" | "bins" | "register" | "schedules"
  >("summary")
  const [reportTrigger, setReportTrigger] = useState(0)

  const handleOpenReport = () => {
    setActiveSubTab("summary")
    setReportTrigger((current) => current + 1)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Caretaker
            </h2>
            <p className="mt-1 text-[rgba(0,0,0,0.7)]">
              Work summary, caretaker registration and maintenance schedules.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenReport}
              className="rounded-lg border border-[#8c7569] bg-white px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Report
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("summary")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                activeSubTab === "summary"
                  ? "bg-[#8c7569] text-white"
                  : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("bins")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                activeSubTab === "bins"
                  ? "bg-[#8c7569] text-white"
                  : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
              }`}
            >
              Bins
            </button>
          </div>
        </div>
      </div>

      <CaretakerSummary
        activeTab={activeSubTab === "bins" ? "bins" : "summary"}
        reportTrigger={reportTrigger}
      />
      {activeSubTab === "register" && <CaretakerRegister />}
      {activeSubTab === "schedules" && <CaretakerSchedules />}
    </div>
  )
}

function CaretakerSchedules({
  initialTab = "alarm",
}: {
  initialTab?: "alarm" | "lift" | "light"
}) {
  const [activeTab, setActiveTab] = useState<"alarm" | "lift" | "light">(
    initialTab,
  )

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      {activeTab === "alarm" && <FireAlarmSchedulePage />}
      {activeTab === "lift" && (
        <BuildingSchedulePage
          scheduleId="lift"
          title="Lift schedule"
          storageKey={LIFT_SCHEDULE_STORAGE_KEY}
        />
      )}
      {activeTab === "light" && (
        <BuildingSchedulePage
          scheduleId="light"
          title="Emergency light"
          storageKey={LIGHT_SCHEDULE_STORAGE_KEY}
        />
      )}
    </div>
  )
}

function FireAlarmSchedulePage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue())
  const [calendarMonth, setCalendarMonth] = useState(() =>
    toDateInputValue().slice(0, 7),
  )
  const [allLogs, setAllLogs] = useState<FireAlarmLogByDate>({})
  const [rows, setRows] = useState<
    Record<FireAlarmBuildingId, FireAlarmLogRow>
  >(() => getDefaultFireAlarmRows())
  const [activeView, setActiveView] = useState<
    "schedule" | "history" | "certificates"
  >("schedule")
  const [reportDateFrom, setReportDateFrom] = useState("")
  const [reportDateTo, setReportDateTo] = useState("")
  const [reportEmail, setReportEmail] = useState("")
  const [isSendingReport, setIsSendingReport] = useState(false)
  const [certificateSearch, setCertificateSearch] = useState("")
  const [certificateDateFrom, setCertificateDateFrom] = useState("")
  const [certificateDateTo, setCertificateDateTo] = useState("")
  const [isCertificateDialogOpen, setIsCertificateDialogOpen] = useState(false)
  const [certificatePreview, setCertificatePreview] =
    useState<CertificateMediaPreviewState | null>(null)
  const [certificateForm, setCertificateForm] =
    useState<FireAlarmExternalCertificateFormState>(
      getEmptyFireAlarmExternalCertificateForm,
    )
  const deferredCertificateSearch = useDeferredValue(certificateSearch.trim())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FIRE_ALARM_STORAGE_KEY)
      if (!raw) {
        localStorage.setItem(
          FIRE_ALARM_STORAGE_KEY,
          JSON.stringify(FIRE_ALARM_INITIAL_LOGS),
        )
        setAllLogs(FIRE_ALARM_INITIAL_LOGS)
        setRows(
          FIRE_ALARM_INITIAL_LOGS[selectedDate] || getDefaultFireAlarmRows(),
        )
        return
      }
      const parsed = JSON.parse(raw) as FireAlarmLogByDate
      const merged = mergeFireAlarmLogsWithInitialSeed(parsed)
      localStorage.setItem(FIRE_ALARM_STORAGE_KEY, JSON.stringify(merged))
      setAllLogs(merged)
      setRows(merged[selectedDate] || getDefaultFireAlarmRows())
    } catch {
      setAllLogs({})
      setRows(getDefaultFireAlarmRows())
    }
  }, [selectedDate])

  const scheduleRows = useMemo(
    () => getFireAlarmScheduleRowsForDate(selectedDate),
    [selectedDate],
  )
  const historyDates = useMemo(
    () => Object.keys(allLogs).sort((a, b) => b.localeCompare(a)),
    [allLogs],
  )
  const datesWithLogs = useMemo(() => {
    const dates = new Set<string>()
    Object.entries(allLogs).forEach(([date, savedRows]) => {
      if (Object.values(savedRows || {}).some((row) => hasLogRowContent(row))) {
        dates.add(date)
      }
    })
    if (Object.values(rows).some((row) => hasLogRowContent(row))) {
      dates.add(selectedDate)
    }
    return dates
  }, [allLogs, rows, selectedDate])
  const calendarMonthLabel = useMemo(() => {
    const [yearRaw, monthRaw] = calendarMonth.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (!year || !month) return calendarMonth
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  }, [calendarMonth])
  const calendarDays = useMemo(() => {
    const [yearRaw, monthRaw] = calendarMonth.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (!year || !month) return [] as { isoDate: string | null; day: string }[]
    const firstDay = new Date(Date.UTC(year, month - 1, 1))
    const firstWeekday = (firstDay.getUTCDay() + 6) % 7
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const cells: { isoDate: string | null; day: string }[] = []

    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ isoDate: null, day: "" })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day: String(day),
      })
    }

    return cells
  }, [calendarMonth])

  useEffect(() => {
    const selectedMonth = selectedDate.slice(0, 7)
    setCalendarMonth((previous) =>
      previous === selectedMonth ? previous : selectedMonth,
    )
  }, [selectedDate])

  const handleShiftCalendarMonth = (step: number) => {
    setCalendarMonth((previous) => {
      const [yearRaw, monthRaw] = previous.split("-")
      const year = Number(yearRaw)
      const month = Number(monthRaw)
      if (!year || !month) return previous
      const shifted = new Date(Date.UTC(year, month - 1 + step, 1))
      const nextYear = shifted.getUTCFullYear()
      const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0")
      return `${nextYear}-${nextMonth}`
    })
  }

  async function handleSendReport() {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      showErrorToast("Invalid date range")
      return
    }
    if (!reportEmail.trim()) {
      showErrorToast("Email is required")
      return
    }

    const sourceLogs: FireAlarmLogByDate = {
      ...allLogs,
      [selectedDate]: rows,
    }

    const selectedDates = Object.keys(sourceLogs)
      .filter((date) => isDateWithinRange(date, reportDateFrom, reportDateTo))
      .sort((a, b) => b.localeCompare(a))

    if (selectedDates.length === 0) {
      showErrorToast("No alarm records found in the selected range")
      return
    }

    const headers = [
      "Date",
      "Building",
      "Call Point",
      "Location",
      "Time",
      "Action Required",
      "Comments",
    ]
    const reportRows: (string | number)[][] = []

    selectedDates.forEach((date) => {
      const logRows = sourceLogs[date] || getDefaultFireAlarmRows()
      const rowsForDate = getFireAlarmScheduleRowsForDate(date)
      rowsForDate.forEach((entry) => {
        const log = logRows[entry.buildingId] || {
          time: "",
          actionRequired: false,
          comment: "",
        }
        reportRows.push([
          formatDateToGb(date),
          entry.buildingLabel,
          entry.callPoint,
          entry.location,
          log.time || "-",
          log.actionRequired ? "Yes" : "No",
          log.comment || "-",
        ])
      })
    })

    const reportTitle = "Fire Alarm Schedule Report"
    const fileName = `fire-alarm-schedule-${new Date().toISOString().slice(0, 10)}.pdf`
    const fileDataBase64 = generatePdfTableReportBase64({
      title: reportTitle,
      dateRange: buildDateRangeLabel(reportDateFrom, reportDateTo),
      headers,
      rows: reportRows,
    })

    if (!fileDataBase64) {
      showErrorToast("Failed to prepare report file")
      return
    }

    try {
      setIsSendingReport(true)
      await apiCall("/api/v1/utils/send-report-email/", {
        method: "POST",
        body: {
          email_to: reportEmail.trim(),
          subject: reportTitle,
          html_content: buildScheduleReportEmailHtml({
            scheduleName: "Fire Alarm",
            periodLabel: buildDateRangeLabel(reportDateFrom, reportDateTo),
          }),
          file_name: fileName,
          file_data_base64: fileDataBase64,
        },
      })
      showSuccessToast("Report sent by email")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send report by email"
      showErrorToast(message)
    } finally {
      setIsSendingReport(false)
    }
  }

  const {
    data: externalCertificatesData,
    isLoading: isLoadingExternalCertificates,
  } = useQuery<FireAlarmExternalCertificatesResponse>({
    queryKey: [
      "fire-alarm-external-certificates",
      deferredCertificateSearch,
      certificateDateFrom,
      certificateDateTo,
    ],
    queryFn: () =>
      apiCall("/api/v1/fire-alarm-external-certificates/", {
        skip: 0,
        limit: 200,
        search: deferredCertificateSearch || undefined,
        date_from: certificateDateFrom || undefined,
        date_to: certificateDateTo || undefined,
      }),
    enabled: activeView === "certificates",
    placeholderData: keepPreviousData,
  })

  const createExternalCertificateMutation = useMutation({
    mutationFn: (payload: {
      certificate_date: string
      certificate_time: string
      company: string
      professional: string
      media_1_name?: string | null
      media_1_data?: string | null
      media_2_name?: string | null
      media_2_data?: string | null
    }) =>
      apiCall("/api/v1/fire-alarm-external-certificates/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("External certificate saved")
      setIsCertificateDialogOpen(false)
      setCertificateForm(getEmptyFireAlarmExternalCertificateForm())
      queryClient.invalidateQueries({
        queryKey: ["fire-alarm-external-certificates"],
      })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Could not save the external certificate",
      )
    },
  })

  const externalCertificates = externalCertificatesData?.data || []
  const externalCertificatesCount =
    externalCertificatesData?.count || externalCertificates.length

  const handleCertificateDialogChange = (open: boolean) => {
    setIsCertificateDialogOpen(open)
    if (!open) {
      setCertificateForm(getEmptyFireAlarmExternalCertificateForm())
    }
  }

  const handleCertificatePreviewOpen = ({
    dataUrl,
    fileName,
    subtitle,
  }: CertificateMediaPreviewState) => {
    setCertificatePreview({
      dataUrl,
      fileName: fileName.trim() || "certificate-document",
      subtitle,
    })
  }

  const handleCertificateFieldChange = <
    K extends keyof FireAlarmExternalCertificateFormState,
  >(
    key: K,
    value: FireAlarmExternalCertificateFormState[K],
  ) => {
    setCertificateForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const handleCertificateMediaSelect = async (
    slot: 1 | 2,
    file: File | null,
  ) => {
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCertificateForm((previous) =>
        slot === 1
          ? {
              ...previous,
              media1Name: file.name,
              media1Data: dataUrl,
            }
          : {
              ...previous,
              media2Name: file.name,
              media2Data: dataUrl,
            },
      )
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not read media",
      )
    }
  }

  const handleCertificateMediaRemove = (slot: 1 | 2) => {
    setCertificateForm((previous) =>
      slot === 1
        ? { ...previous, media1Name: "", media1Data: null }
        : { ...previous, media2Name: "", media2Data: null },
    )
  }

  const handleCreateExternalCertificate = () => {
    if (!certificateForm.certificateDate) {
      showErrorToast("Date is required")
      return
    }
    if (!certificateForm.certificateTime) {
      showErrorToast("Time is required")
      return
    }
    if (!certificateForm.company.trim()) {
      showErrorToast("Company is required")
      return
    }
    if (!certificateForm.professional.trim()) {
      showErrorToast("Professional is required")
      return
    }

    createExternalCertificateMutation.mutate({
      certificate_date: certificateForm.certificateDate,
      certificate_time: certificateForm.certificateTime,
      company: certificateForm.company.trim(),
      professional: certificateForm.professional.trim(),
      media_1_name: certificateForm.media1Name || null,
      media_1_data: certificateForm.media1Data,
      media_2_name: certificateForm.media2Name || null,
      media_2_data: certificateForm.media2Data,
    })
  }

  const renderCertificateMediaCell = (
    certificate: FireAlarmExternalCertificate,
    slot: 1 | 2,
  ) => {
    const mediaData =
      slot === 1 ? certificate.media_1_data : certificate.media_2_data
    const mediaName =
      slot === 1 ? certificate.media_1_name : certificate.media_2_name

    if (!mediaData) return "-"

    return (
      <div className="space-y-2">
        {isImageDataUrl(mediaData) && (
          <button
            type="button"
            onClick={() =>
              handleCertificatePreviewOpen({
                dataUrl: mediaData,
                fileName: mediaName || `certificate-media-${slot}`,
                subtitle: `${certificate.company} • ${certificate.professional}`,
              })
            }
            className="block"
          >
            <img
              src={mediaData}
              alt={mediaName || `Media ${slot} preview`}
              className="max-h-20 rounded border border-[#ddd] transition-all duration-200 hover:opacity-90"
            />
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            handleCertificatePreviewOpen({
              dataUrl: mediaData,
              fileName: mediaName || `certificate-media-${slot}`,
              subtitle: `${certificate.company} • ${certificate.professional}`,
            })
          }
          className="inline-flex rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
        >
          {mediaName || "Preview document"}
        </button>
      </div>
    )
  }

  if (activeView === "certificates") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#55311c]">
              External fire alarm certificates
            </h3>
            <p className="text-sm text-[rgba(0,0,0,0.65)]">
              Search certificates by professional, company, or date.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveView("schedule")}
              className="rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Back to schedule
            </button>
            <button
              type="button"
              onClick={() => setIsCertificateDialogOpen(true)}
              className="rounded-lg bg-[#8c7569] px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Add record
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label
                htmlFor="fire-alarm-certificate-search"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Search
              </label>
              <input
                id="fire-alarm-certificate-search"
                type="text"
                value={certificateSearch}
                onChange={(event) => setCertificateSearch(event.target.value)}
                placeholder="Search by professional or company"
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="fire-alarm-certificate-date-from"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date from
              </label>
              <input
                id="fire-alarm-certificate-date-from"
                type="date"
                value={certificateDateFrom}
                onChange={(event) => setCertificateDateFrom(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="fire-alarm-certificate-date-to"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date to
              </label>
              <input
                id="fire-alarm-certificate-date-to"
                type="date"
                min={certificateDateFrom || undefined}
                value={certificateDateTo}
                onChange={(event) => setCertificateDateTo(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[rgba(0,0,0,0.65)]">
              {externalCertificatesCount} record
              {externalCertificatesCount === 1 ? "" : "s"} found.
            </p>
            <button
              type="button"
              onClick={() => {
                setCertificateSearch("")
                setCertificateDateFrom("")
                setCertificateDateTo("")
              }}
              className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Clear filters
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Date
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Time
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Company
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Professional
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Doc 1
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Doc 2
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Added
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoadingExternalCertificates && (
                <tr>
                  <td
                    colSpan={7}
                    className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    Loading certificates...
                  </td>
                </tr>
              )}
              {!isLoadingExternalCertificates &&
                externalCertificates.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                    >
                      No certificates found for the selected filters.
                    </td>
                  </tr>
                )}
              {!isLoadingExternalCertificates &&
                externalCertificates.map((certificate) => (
                  <tr
                    key={certificate.id}
                    className="bg-white hover:bg-[#f8f5f3]"
                  >
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatDateToGb(certificate.certificate_date)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {certificate.certificate_time}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {certificate.company}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {certificate.professional}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {renderCertificateMediaCell(certificate, 1)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {renderCertificateMediaCell(certificate, 2)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {new Date(certificate.created_at).toLocaleString("en-GB")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <Dialog
          open={isCertificateDialogOpen}
          onOpenChange={handleCertificateDialogChange}
        >
          <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-[#55311c]">
                Add external certificate
              </DialogTitle>
              <DialogDescription className="text-[rgba(0,0,0,0.7)]">
                Record a new external fire alarm certificate entry.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="fire-alarm-certificate-form-date"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Date
                </label>
                <input
                  id="fire-alarm-certificate-form-date"
                  type="date"
                  value={certificateForm.certificateDate}
                  onChange={(event) =>
                    handleCertificateFieldChange(
                      "certificateDate",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="fire-alarm-certificate-form-time"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Time
                </label>
                <input
                  id="fire-alarm-certificate-form-time"
                  type="time"
                  value={certificateForm.certificateTime}
                  onChange={(event) =>
                    handleCertificateFieldChange(
                      "certificateTime",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="fire-alarm-certificate-form-company"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Company
                </label>
                <input
                  id="fire-alarm-certificate-form-company"
                  type="text"
                  value={certificateForm.company}
                  onChange={(event) =>
                    handleCertificateFieldChange("company", event.target.value)
                  }
                  placeholder="Company name"
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="fire-alarm-certificate-form-professional"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Professional
                </label>
                <input
                  id="fire-alarm-certificate-form-professional"
                  type="text"
                  value={certificateForm.professional}
                  onChange={(event) =>
                    handleCertificateFieldChange(
                      "professional",
                      event.target.value,
                    )
                  }
                  placeholder="Professional name"
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#55311c]">
                      Media 1
                    </h4>
                    <p className="text-xs text-[rgba(0,0,0,0.65)]">
                      Add an image or PDF.
                    </p>
                  </div>
                  <input
                    id="fire-alarm-certificate-media-1"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(event) =>
                      handleCertificateMediaSelect(
                        1,
                        event.target.files?.[0] || null,
                      )
                    }
                    className="hidden"
                  />
                  <label
                    htmlFor="fire-alarm-certificate-media-1"
                    className="cursor-pointer rounded-lg border border-[#8c7569] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                  >
                    Select media
                  </label>
                </div>
                <p className="mt-3 text-sm text-[#55311c]">
                  {certificateForm.media1Name || "No media selected"}
                </p>
                {certificateForm.media1Data && (
                  <div className="mt-3 space-y-3">
                    {isImageDataUrl(certificateForm.media1Data) && (
                      <img
                        src={certificateForm.media1Data}
                        alt={certificateForm.media1Name || "Media 1 preview"}
                        className="max-h-40 rounded border border-[#ddd]"
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={certificateForm.media1Data}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[#8c7569] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                      >
                        Open media
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCertificateMediaRemove(1)}
                        className="rounded-lg border border-[#d7c8bf] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f7f0eb]"
                      >
                        Remove media
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#55311c]">
                      Media 2
                    </h4>
                    <p className="text-xs text-[rgba(0,0,0,0.65)]">
                      Add an image or PDF.
                    </p>
                  </div>
                  <input
                    id="fire-alarm-certificate-media-2"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(event) =>
                      handleCertificateMediaSelect(
                        2,
                        event.target.files?.[0] || null,
                      )
                    }
                    className="hidden"
                  />
                  <label
                    htmlFor="fire-alarm-certificate-media-2"
                    className="cursor-pointer rounded-lg border border-[#8c7569] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                  >
                    Select media
                  </label>
                </div>
                <p className="mt-3 text-sm text-[#55311c]">
                  {certificateForm.media2Name || "No media selected"}
                </p>
                {certificateForm.media2Data && (
                  <div className="mt-3 space-y-3">
                    {isImageDataUrl(certificateForm.media2Data) && (
                      <img
                        src={certificateForm.media2Data}
                        alt={certificateForm.media2Name || "Media 2 preview"}
                        className="max-h-40 rounded border border-[#ddd]"
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={certificateForm.media2Data}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[#8c7569] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                      >
                        Open media
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCertificateMediaRemove(2)}
                        className="rounded-lg border border-[#d7c8bf] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f7f0eb]"
                      >
                        Remove media
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => handleCertificateDialogChange(false)}
                className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateExternalCertificate}
                disabled={createExternalCertificateMutation.isPending}
                className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createExternalCertificateMutation.isPending
                  ? "Saving..."
                  : "Save record"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(certificatePreview)}
          onOpenChange={(open) => {
            if (!open) setCertificatePreview(null)
          }}
        >
          <DialogContent className="overflow-hidden border-[#d6d9de] bg-[#eef1f4] p-0 text-[#1f2328] sm:max-w-6xl [&>button]:text-white [&>button]:opacity-90 [&>button]:ring-offset-[#2f3338]">
            {certificatePreview && (
              <>
                <div className="flex items-center justify-between gap-4 bg-[#2f3338] px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {certificatePreview.fileName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[rgba(255,255,255,0.78)]">
                      <span>{certificatePreview.subtitle}</span>
                      <span className="rounded-full border border-[rgba(255,255,255,0.22)] px-2 py-0.5 font-semibold uppercase tracking-wide text-[10px]">
                        {isImageDataUrl(certificatePreview.dataUrl)
                          ? "Image"
                          : isPdfDataUrl(certificatePreview.dataUrl)
                            ? "PDF"
                            : getDataUrlMimeType(certificatePreview.dataUrl) ||
                              "Document"}
                      </span>
                    </div>
                  </div>
                  <a
                    href={certificatePreview.dataUrl}
                    download={certificatePreview.fileName}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[rgba(255,255,255,0.16)]"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 fill-none stroke-current"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3v12" />
                      <path d="m7 10 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    Download
                  </a>
                </div>

                <div className="max-h-[80vh] overflow-auto bg-[#d7dde4] p-4 sm:p-6">
                  {isImageDataUrl(certificatePreview.dataUrl) ? (
                    <div className="mx-auto flex max-w-5xl justify-center rounded-[24px] bg-white p-4 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
                      <img
                        src={certificatePreview.dataUrl}
                        alt={certificatePreview.fileName}
                        className="max-h-[72vh] rounded-[18px] object-contain"
                      />
                    </div>
                  ) : isPdfDataUrl(certificatePreview.dataUrl) ? (
                    <div className="mx-auto h-[72vh] max-w-5xl rounded-[24px] bg-white p-3 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
                      <iframe
                        src={certificatePreview.dataUrl}
                        title={certificatePreview.fileName}
                        className="h-full w-full rounded-[18px] border border-[#d7dce1] bg-white"
                      />
                    </div>
                  ) : (
                    <div className="mx-auto max-w-3xl rounded-[24px] bg-white p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
                      <p className="text-lg font-semibold text-[#1f2328]">
                        Preview is not available for this document type.
                      </p>
                      <p className="mt-2 text-sm text-[rgba(0,0,0,0.68)]">
                        Use the download button above to open the file locally.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  if (activeView === "history") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
          <div>
            <h3 className="text-lg font-bold text-[#55311c]">
              Fire alarm schedule history
            </h3>
            <p className="text-sm text-[rgba(0,0,0,0.65)]">
              Choose a saved date to open the record.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveView("schedule")}
            className="rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
          >
            Back to schedule
          </button>
        </div>

        <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
          <h4 className="mb-3 text-sm font-semibold text-[#55311c]">
            Generate report
          </h4>
          <p className="mb-3 text-xs text-[rgba(0,0,0,0.65)]">
            Enter email and optional date range to send the PDF report.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label
                htmlFor="alarm-report-email"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Email
              </label>
              <input
                id="alarm-report-email"
                type="email"
                value={reportEmail}
                onChange={(event) => setReportEmail(event.target.value)}
                placeholder="report@email.com"
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="alarm-report-date-from"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date from
              </label>
              <input
                id="alarm-report-date-from"
                type="date"
                value={reportDateFrom}
                onChange={(event) => setReportDateFrom(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="alarm-report-date-to"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date to
              </label>
              <input
                id="alarm-report-date-to"
                type="date"
                min={reportDateFrom || undefined}
                value={reportDateTo}
                onChange={(event) => setReportDateTo(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSendReport}
                disabled={isSendingReport}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingReport ? "Sending..." : "Send by email"}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Date
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Building / Call Point / Location
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Saved rows
                </th>
                <th className="border border-[#736055] px-3 py-2 text-center text-sm font-semibold text-white">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {historyDates.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    No saved records yet.
                  </td>
                </tr>
              )}
              {historyDates.map((date) => {
                const savedRows = allLogs[date] || getDefaultFireAlarmRows()
                const rowsForDate = getFireAlarmScheduleRowsForDate(date)
                const totalSaved = rowsForDate.filter((entry) =>
                  hasLogRowContent(savedRows[entry.buildingId]),
                ).length
                return (
                  <tr key={date} className="bg-white hover:bg-[#f8f5f3]">
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatDateToGb(date)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-xs text-[#55311c]">
                      <div className="space-y-1">
                        {rowsForDate.map((entry) => {
                          const rowData = savedRows[entry.buildingId] || {
                            time: "",
                            actionRequired: false,
                            comment: "",
                          }
                          return (
                            <div key={`${date}-${entry.buildingId}`}>
                              <span className="font-semibold">
                                {entry.buildingLabel}
                              </span>{" "}
                              | {entry.callPoint} | {entry.location} |{" "}
                              {rowData.time || "-"}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {totalSaved} / {rowsForDate.length}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(date)
                          setActiveView("schedule")
                        }}
                        className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const handleRowChange = (
    buildingId: FireAlarmBuildingId,
    key: keyof FireAlarmLogRow,
    value: string | boolean,
  ) => {
    setRows((previous) => {
      const nextRow = {
        ...previous[buildingId],
        [key]: value,
      }
      if (key === "actionRequired" && value === false) {
        nextRow.comment = ""
      }
      return {
        ...previous,
        [buildingId]: nextRow,
      }
    })
  }

  const handleSave = () => {
    const hasTime = scheduleRows.some((row) => rows[row.buildingId]?.time)
    if (!hasTime) {
      showErrorToast("Fill at least one time before saving")
      return
    }

    const nextLogs = {
      ...allLogs,
      [selectedDate]: rows,
    }

    setAllLogs(nextLogs)
    localStorage.setItem(FIRE_ALARM_STORAGE_KEY, JSON.stringify(nextLogs))
    showSuccessToast("Alarm schedule saved")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#55311c]">
            Fire alarm schedule
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveView("history")}
            className="self-start rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:self-auto"
          >
            Schedule history
          </button>
          <button
            type="button"
            onClick={() => setActiveView("certificates")}
            className="self-start rounded-lg bg-[#8c7569] px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] sm:self-auto"
          >
            Certificates
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-[#55311c]">
              Fire alarm calendar
            </h4>
            <p className="text-xs text-[rgba(0,0,0,0.65)]">
              Green dates already have saved records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleShiftCalendarMonth(-1)}
              className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Prev month
            </button>
            <span className="text-xs font-semibold text-[#55311c]">
              {calendarMonthLabel}
            </span>
            <button
              type="button"
              onClick={() => handleShiftCalendarMonth(1)}
              className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Next month
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.6)]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekDay) => (
            <div key={weekDay}>{weekDay}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarDays.map((cell, index) => {
            if (!cell.isoDate) {
              return <div key={`empty-${index}`} className="h-8 rounded" />
            }
            const isoDate = cell.isoDate
            const isSelected = isoDate === selectedDate
            const hasRecord = datesWithLogs.has(isoDate)
            return (
              <button
                key={isoDate}
                type="button"
                onClick={() => setSelectedDate(isoDate)}
                className={`h-8 rounded border text-xs font-semibold transition-all duration-200 ${
                  isSelected
                    ? "border-[#55311c] bg-[#55311c] text-white"
                    : hasRecord
                      ? "border-[#5f9f7d] bg-[#eef7f1] text-[#2f6a4b] hover:bg-[#dff0e6]"
                      : "border-[#d9d0ca] bg-white text-[#55311c] hover:bg-[#f0ebe7]"
                }`}
              >
                {cell.day}
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-[#8c7569]">
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Date
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Building
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Call Point
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Location
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Time
              </th>
              <th className="border border-[#736055] px-3 py-2 text-center text-sm font-semibold text-white">
                Action required
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Comments
              </th>
            </tr>
          </thead>
          <tbody>
            {scheduleRows.map((row) => {
              const rowData = rows[row.buildingId] || {
                time: "",
                actionRequired: false,
                comment: "",
              }
              return (
                <tr
                  key={row.buildingId}
                  className="bg-white hover:bg-[#f8f5f3]"
                >
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    {formatDateToGb(selectedDate)}
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    {row.buildingLabel}
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm font-semibold text-[#55311c]">
                    {row.callPoint}
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    {row.location}
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    <input
                      type="time"
                      value={rowData.time}
                      onChange={(event) =>
                        handleRowChange(
                          row.buildingId,
                          "time",
                          event.target.value,
                        )
                      }
                      className="w-full rounded border border-[#d9d0ca] px-2 py-1 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm">
                    <input
                      type="checkbox"
                      checked={rowData.actionRequired}
                      onChange={(event) =>
                        handleRowChange(
                          row.buildingId,
                          "actionRequired",
                          event.target.checked,
                        )
                      }
                      className="h-4 w-4 cursor-pointer accent-[#8c7569]"
                    />
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    <input
                      type="text"
                      value={rowData.comment}
                      disabled={!rowData.actionRequired}
                      onChange={(event) =>
                        handleRowChange(
                          row.buildingId,
                          "comment",
                          event.target.value,
                        )
                      }
                      placeholder={
                        rowData.actionRequired
                          ? "Write action details"
                          : "Enable Action required to add comment"
                      }
                      className="w-full rounded border border-[#d9d0ca] px-2 py-1 text-sm text-[#55311c] disabled:cursor-not-allowed disabled:bg-[#f0ece9] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-[#8c7569] px-6 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function BuildingSchedulePage({
  scheduleId,
  title,
  storageKey,
}: {
  scheduleId: "lift" | "light"
  title: string
  storageKey: string
}) {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue())
  const [calendarMonth, setCalendarMonth] = useState(() =>
    toDateInputValue().slice(0, 7),
  )
  const [allLogs, setAllLogs] = useState<FireAlarmLogByDate>({})
  const [rows, setRows] = useState<Record<string, FireAlarmLogRow>>(() =>
    getDefaultRowsForSchedule(scheduleId),
  )
  const [activeView, setActiveView] = useState<"schedule" | "history">(
    "schedule",
  )
  const [reportDateFrom, setReportDateFrom] = useState("")
  const [reportDateTo, setReportDateTo] = useState("")
  const [reportEmail, setReportEmail] = useState("")
  const [isSendingReport, setIsSendingReport] = useState(false)
  const initialLogs = useMemo(
    () => getInitialLogsByScheduleId(scheduleId),
    [scheduleId],
  )
  const emptyRows = useMemo(
    () => getDefaultRowsForSchedule(scheduleId),
    [scheduleId],
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) {
        const normalizedInitialLogs =
          scheduleId === "light"
            ? normalizeLightScheduleLogs(initialLogs)
            : initialLogs
        localStorage.setItem(storageKey, JSON.stringify(normalizedInitialLogs))
        setAllLogs(normalizedInitialLogs)
        setRows(
          normalizedInitialLogs[selectedDate] ||
            (scheduleId === "light"
              ? normalizeLightScheduleRows(emptyRows)
              : emptyRows),
        )
        return
      }
      const parsed = JSON.parse(raw) as FireAlarmLogByDate
      const mergedSource =
        scheduleId === "light" ? normalizeLightScheduleLogs(parsed) : parsed
      const merged = mergeLogsWithInitialSeed(mergedSource, initialLogs)
      localStorage.setItem(storageKey, JSON.stringify(merged))
      setAllLogs(merged)
      setRows(
        merged[selectedDate] ||
          (scheduleId === "light"
            ? normalizeLightScheduleRows(emptyRows)
            : emptyRows),
      )
    } catch {
      setAllLogs({})
      setRows(
        scheduleId === "light"
          ? normalizeLightScheduleRows(emptyRows)
          : emptyRows,
      )
    }
  }, [emptyRows, initialLogs, scheduleId, selectedDate, storageKey])

  const buildingRows = useMemo(
    () => getBuildingsForSchedule(scheduleId),
    [scheduleId],
  )
  const historyDates = useMemo(
    () => Object.keys(allLogs).sort((a, b) => b.localeCompare(a)),
    [allLogs],
  )
  const datesWithLogs = useMemo(() => {
    const dates = new Set<string>()
    Object.entries(allLogs).forEach(([date, savedRows]) => {
      if (Object.values(savedRows || {}).some((row) => hasLogRowContent(row))) {
        dates.add(date)
      }
    })
    if (Object.values(rows).some((row) => hasLogRowContent(row))) {
      dates.add(selectedDate)
    }
    return dates
  }, [allLogs, rows, selectedDate])
  const calendarMonthLabel = useMemo(() => {
    const [yearRaw, monthRaw] = calendarMonth.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (!year || !month) return calendarMonth
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  }, [calendarMonth])
  const calendarDays = useMemo(() => {
    const [yearRaw, monthRaw] = calendarMonth.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (!year || !month) return [] as { isoDate: string | null; day: string }[]
    const firstDay = new Date(Date.UTC(year, month - 1, 1))
    const firstWeekday = (firstDay.getUTCDay() + 6) % 7
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const cells: { isoDate: string | null; day: string }[] = []

    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ isoDate: null, day: "" })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day: String(day),
      })
    }

    return cells
  }, [calendarMonth])

  const idPrefix = `${scheduleId}-schedule`

  useEffect(() => {
    const selectedMonth = selectedDate.slice(0, 7)
    setCalendarMonth((previous) =>
      previous === selectedMonth ? previous : selectedMonth,
    )
  }, [selectedDate])

  const handleShiftCalendarMonth = (step: number) => {
    setCalendarMonth((previous) => {
      const [yearRaw, monthRaw] = previous.split("-")
      const year = Number(yearRaw)
      const month = Number(monthRaw)
      if (!year || !month) return previous
      const shifted = new Date(Date.UTC(year, month - 1 + step, 1))
      const nextYear = shifted.getUTCFullYear()
      const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0")
      return `${nextYear}-${nextMonth}`
    })
  }

  const handleRowChange = (
    buildingId: ScheduleBuildingId,
    key: keyof FireAlarmLogRow,
    value: string | boolean,
  ) => {
    setRows((previous) => {
      const nextRow = {
        ...previous[buildingId],
        [key]: value,
      }
      if (key === "actionRequired" && value === false) {
        nextRow.comment = ""
      }
      return {
        ...previous,
        [buildingId]: nextRow,
      }
    })
  }

  const handleSave = () => {
    const hasTime = buildingRows.some((row) => rows[row.buildingId]?.time)
    if (!hasTime) {
      showErrorToast("Fill at least one time before saving")
      return
    }
    const nextLogs = {
      ...allLogs,
      [selectedDate]: rows,
    }
    setAllLogs(nextLogs)
    localStorage.setItem(storageKey, JSON.stringify(nextLogs))
    showSuccessToast(`${title} saved`)
  }

  async function handleSendReport() {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      showErrorToast("Invalid date range")
      return
    }
    if (!reportEmail.trim()) {
      showErrorToast("Email is required")
      return
    }

    const sourceLogs: FireAlarmLogByDate = {
      ...allLogs,
      [selectedDate]: rows,
    }

    const selectedDates = Object.keys(sourceLogs)
      .filter((date) => isDateWithinRange(date, reportDateFrom, reportDateTo))
      .sort((a, b) => b.localeCompare(a))

    if (selectedDates.length === 0) {
      showErrorToast("No records found in the selected range")
      return
    }

    const headers = ["Date", "Building", "Time", "Action Required", "Comments"]
    const reportRows: (string | number)[][] = []

    selectedDates.forEach((date) => {
      const logRows =
        sourceLogs[date] ||
        (scheduleId === "light"
          ? normalizeLightScheduleRows(emptyRows)
          : emptyRows)
      buildingRows.forEach((entry) => {
        const log = logRows[entry.buildingId] || {
          time: "",
          actionRequired: false,
          comment: "",
        }
        reportRows.push([
          formatDateToGb(date),
          entry.buildingLabel,
          log.time || "-",
          log.actionRequired ? "Yes" : "No",
          log.comment || "-",
        ])
      })
    })

    const reportTitle = `${title} Report`
    const fileName = `${scheduleId}-schedule-${new Date().toISOString().slice(0, 10)}.pdf`
    const fileDataBase64 = generatePdfTableReportBase64({
      title: reportTitle,
      dateRange: buildDateRangeLabel(reportDateFrom, reportDateTo),
      headers,
      rows: reportRows,
    })

    if (!fileDataBase64) {
      showErrorToast("Failed to prepare report file")
      return
    }

    try {
      setIsSendingReport(true)
      await apiCall("/api/v1/utils/send-report-email/", {
        method: "POST",
        body: {
          email_to: reportEmail.trim(),
          subject: reportTitle,
          html_content: buildScheduleReportEmailHtml({
            scheduleName: title,
            periodLabel: buildDateRangeLabel(reportDateFrom, reportDateTo),
          }),
          file_name: fileName,
          file_data_base64: fileDataBase64,
        },
      })
      showSuccessToast("Report sent by email")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send report by email"
      showErrorToast(message)
    } finally {
      setIsSendingReport(false)
    }
  }

  if (activeView === "history") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
          <div>
            <h3 className="text-lg font-bold text-[#55311c]">
              {title} history
            </h3>
            <p className="text-sm text-[rgba(0,0,0,0.65)]">
              Choose a saved date to open the record.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveView("schedule")}
            className="rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
          >
            Back
          </button>
        </div>

        <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
          <h4 className="mb-3 text-sm font-semibold text-[#55311c]">
            Generate report
          </h4>
          <p className="mb-3 text-xs text-[rgba(0,0,0,0.65)]">
            Enter email and optional date range to send the PDF report.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label
                htmlFor={`${idPrefix}-report-email`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Email
              </label>
              <input
                id={`${idPrefix}-report-email`}
                type="email"
                value={reportEmail}
                onChange={(event) => setReportEmail(event.target.value)}
                placeholder="report@email.com"
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor={`${idPrefix}-report-date-from`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date from
              </label>
              <input
                id={`${idPrefix}-report-date-from`}
                type="date"
                value={reportDateFrom}
                onChange={(event) => setReportDateFrom(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor={`${idPrefix}-report-date-to`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date to
              </label>
              <input
                id={`${idPrefix}-report-date-to`}
                type="date"
                min={reportDateFrom || undefined}
                value={reportDateTo}
                onChange={(event) => setReportDateTo(event.target.value)}
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSendReport}
                disabled={isSendingReport}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingReport ? "Sending..." : "Send by email"}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Date
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Building | Time
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Saved rows
                </th>
                <th className="border border-[#736055] px-3 py-2 text-center text-sm font-semibold text-white">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {historyDates.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    No saved records yet.
                  </td>
                </tr>
              )}
              {historyDates.map((date) => {
                const savedRows =
                  allLogs[date] ||
                  (scheduleId === "light"
                    ? normalizeLightScheduleRows(emptyRows)
                    : emptyRows)
                const totalSaved = buildingRows.filter((entry) =>
                  hasLogRowContent(savedRows[entry.buildingId]),
                ).length
                return (
                  <tr key={date} className="bg-white hover:bg-[#f8f5f3]">
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatDateToGb(date)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-xs text-[#55311c]">
                      <div className="space-y-1">
                        {buildingRows.map((entry) => {
                          const rowData = savedRows[entry.buildingId] || {
                            time: "",
                            actionRequired: false,
                            comment: "",
                          }
                          return (
                            <div key={`${date}-${entry.buildingId}`}>
                              <span className="font-semibold">
                                {entry.buildingLabel}
                              </span>{" "}
                              | {rowData.time || "-"}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {totalSaved} / {buildingRows.length}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(date)
                          setActiveView("schedule")
                        }}
                        className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#55311c]">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => setActiveView("history")}
          className="self-start rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:self-auto"
        >
          View history
        </button>
      </div>

      <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-[#55311c]">
              {title} calendar
            </h4>
            <p className="text-xs text-[rgba(0,0,0,0.65)]">
              Green dates already have saved records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleShiftCalendarMonth(-1)}
              className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Prev month
            </button>
            <span className="text-xs font-semibold text-[#55311c]">
              {calendarMonthLabel}
            </span>
            <button
              type="button"
              onClick={() => handleShiftCalendarMonth(1)}
              className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Next month
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.6)]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekDay) => (
            <div key={weekDay}>{weekDay}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarDays.map((cell, index) => {
            if (!cell.isoDate) {
              return <div key={`empty-${index}`} className="h-8 rounded" />
            }
            const isoDate = cell.isoDate
            const isSelected = isoDate === selectedDate
            const hasRecord = datesWithLogs.has(isoDate)
            return (
              <button
                key={isoDate}
                type="button"
                onClick={() => setSelectedDate(isoDate)}
                className={`h-8 rounded border text-xs font-semibold transition-all duration-200 ${
                  isSelected
                    ? "border-[#55311c] bg-[#55311c] text-white"
                    : hasRecord
                      ? "border-[#5f9f7d] bg-[#eef7f1] text-[#2f6a4b] hover:bg-[#dff0e6]"
                      : "border-[#d9d0ca] bg-white text-[#55311c] hover:bg-[#f0ebe7]"
                }`}
              >
                {cell.day}
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-[#8c7569]">
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Date
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Building
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Time
              </th>
              <th className="border border-[#736055] px-3 py-2 text-center text-sm font-semibold text-white">
                Action required
              </th>
              <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                Comments
              </th>
            </tr>
          </thead>
          <tbody>
            {buildingRows.map((row) => {
              const rowData = rows[row.buildingId] || {
                time: "",
                actionRequired: false,
                comment: "",
              }
              return (
                <tr
                  key={row.buildingId}
                  className="bg-white hover:bg-[#f8f5f3]"
                >
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    {formatDateToGb(selectedDate)}
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    {row.buildingLabel}
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    <input
                      type="time"
                      value={rowData.time}
                      onChange={(event) =>
                        handleRowChange(
                          row.buildingId,
                          "time",
                          event.target.value,
                        )
                      }
                      className="w-full rounded border border-[#d9d0ca] px-2 py-1 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm">
                    <input
                      type="checkbox"
                      checked={rowData.actionRequired}
                      onChange={(event) =>
                        handleRowChange(
                          row.buildingId,
                          "actionRequired",
                          event.target.checked,
                        )
                      }
                      className="h-4 w-4 cursor-pointer accent-[#8c7569]"
                    />
                  </td>
                  <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                    <input
                      type="text"
                      value={rowData.comment}
                      disabled={!rowData.actionRequired}
                      onChange={(event) =>
                        handleRowChange(
                          row.buildingId,
                          "comment",
                          event.target.value,
                        )
                      }
                      placeholder={
                        rowData.actionRequired
                          ? "Write action details"
                          : "Enable Action required to add comment"
                      }
                      className="w-full rounded border border-[#d9d0ca] px-2 py-1 text-sm text-[#55311c] disabled:cursor-not-allowed disabled:bg-[#f0ece9] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-[#8c7569] px-6 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function CleanerSummary() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { data: cleanersData } = useQuery<ApiListResponse<Funcionario>>({
    queryKey: ["funcionarios", "cleaners-summary"],
    queryFn: () => apiCall("/api/v1/funcionarios/", { skip: 0, limit: 500 }),
  })

  const { data: acessData, isLoading: isLoadingAcess } = useQuery<
    ApiListResponse<AcessRecord>
  >({
    queryKey: ["acess", "cleaner"],
    queryFn: () => apiCall("/api/v1/acess/", { skip: 0, limit: 200 }),
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings", "cleaner-summary"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const acesses = (acessData?.data || []) as AcessRecord[]
  const buildings = (buildingsData?.data || []) as Building[]
  const [editingCleanerRecord, setEditingCleanerRecord] =
    useState<CleanerRecordEditState | null>(null)
  const [editedCleanerInTimeValue, setEditedCleanerInTimeValue] = useState("")
  const [editedCleanerOutTimeValue, setEditedCleanerOutTimeValue] = useState("")
  const [isSavingCleanerRecordEdit, setIsSavingCleanerRecordEdit] =
    useState(false)
  const [isCreatingCleanerTimeout, setIsCreatingCleanerTimeout] = useState<
    string | null
  >(null)
  const [selectedCleanerDateFrom, setSelectedCleanerDateFrom] = useState("")
  const [selectedCleanerDateTo, setSelectedCleanerDateTo] = useState("")

  const buildingMap = useMemo(() => {
    const map = new Map<EntityId, string>()
    buildings.forEach((building) => {
      map.set(building.id, building.nome)
    })
    return map
  }, [buildings])

  const activeCleanerId = useMemo(() => {
    const cleaners = (cleanersData?.data || []).filter(
      (funcionario: Funcionario) => funcionario.cargo === 0,
    )
    return (
      cleaners.find((cleaner: Funcionario) => cleaner.is_default)?.id || null
    )
  }, [cleanersData])

  const sessions = useMemo(() => {
    const sorted = [...acesses]
      .filter((record) => record?.data)
      .sort(
        (a, b) =>
          new Date(a.data ?? 0).getTime() - new Date(b.data ?? 0).getTime(),
      )

    const filtered = activeCleanerId
      ? sorted.filter(
          (record) =>
            record.funcionario_id === activeCleanerId ||
            record.funcionario_id === undefined,
        )
      : sorted

    const result: Array<{ inRecord?: AcessRecord; outRecord?: AcessRecord }> =
      []
    let openRecord: AcessRecord | null = null

    filtered.forEach((record) => {
      if (record.operacao === 0) {
        if (!openRecord) openRecord = record
      } else if (record.operacao === 1) {
        if (openRecord) {
          result.push({ inRecord: openRecord, outRecord: record })
          openRecord = null
        } else {
          result.push({ outRecord: record })
        }
      }
    })

    if (openRecord) result.push({ inRecord: openRecord })

    return result.reverse()
  }, [acesses, activeCleanerId])

  const formatDate = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleDateString("en-GB")
  }

  const formatTime = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatUsed = (inValue?: string | null, outValue?: string | null) => {
    if (!inValue || !outValue) return "-"
    const start = new Date(inValue).getTime()
    const end = new Date(outValue).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "-"
    const diffMinutes = Math.floor((end - start) / 60000)
    if (diffMinutes >= 1440) return "No exit this day"
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    if (hours <= 0) return `${minutes}m`
    return `${hours}h ${minutes}m`
  }

  const getDurationMinutes = (
    inValue?: string | null,
    outValue?: string | null,
  ) => {
    if (!inValue || !outValue) return 0
    const start = new Date(inValue).getTime()
    const end = new Date(outValue).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
    const diffMinutes = Math.floor((end - start) / 60000)
    if (diffMinutes >= 1440) return 0
    return diffMinutes
  }

  const formatTotalMinutes = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  const enrichedSessions = useMemo(() => {
    return sessions.map((session) => {
      const buildingId =
        session.inRecord?.building_id || session.outRecord?.building_id
      const buildingLabel =
        (buildingId && buildingMap.get(buildingId)) ||
        session.inRecord?.building_nome ||
        session.outRecord?.building_nome ||
        "-"
      const durationMinutes = getDurationMinutes(
        session.inRecord?.data,
        session.outRecord?.data,
      )
      const startDate = session.inRecord?.data
        ? new Date(session.inRecord.data)
        : null

      return {
        ...session,
        buildingLabel,
        durationMinutes,
        startDate,
      }
    })
  }, [sessions, buildingMap, getDurationMinutes])

  const { earliestCleanerSessionDate, latestCleanerSessionDate } =
    useMemo(() => {
      const sessionDates = enrichedSessions
        .map((session) =>
          session.startDate ? toIsoDateString(session.startDate) : null,
        )
        .filter((value): value is string => Boolean(value))
        .sort()

      return {
        earliestCleanerSessionDate: sessionDates[0] || "",
        latestCleanerSessionDate: sessionDates[sessionDates.length - 1] || "",
      }
    }, [enrichedSessions])

  const { cleanerDateFrom, cleanerDateTo } = useMemo(() => {
    if (
      selectedCleanerDateFrom &&
      selectedCleanerDateTo &&
      selectedCleanerDateFrom > selectedCleanerDateTo
    ) {
      return {
        cleanerDateFrom: selectedCleanerDateTo,
        cleanerDateTo: selectedCleanerDateFrom,
      }
    }

    return {
      cleanerDateFrom: selectedCleanerDateFrom,
      cleanerDateTo: selectedCleanerDateTo,
    }
  }, [selectedCleanerDateFrom, selectedCleanerDateTo])

  const tableSessions = useMemo(
    () => enrichedSessions.slice(0, 20),
    [enrichedSessions],
  )

  const buildingHoursData = useMemo(() => {
    const hoursByBuilding = new Map<string, number>()

    enrichedSessions.forEach((session) => {
      if (!session.durationMinutes || !session.buildingLabel) return
      if (!session.startDate) return
      if (
        !isDateWithinRange(
          toIsoDateString(session.startDate),
          cleanerDateFrom,
          cleanerDateTo,
        )
      ) {
        return
      }
      const current = hoursByBuilding.get(session.buildingLabel) || 0
      hoursByBuilding.set(
        session.buildingLabel,
        current + session.durationMinutes,
      )
    })

    return [...hoursByBuilding.entries()]
      .map(([building, minutes]) => ({
        building,
        hours: Number((minutes / 60).toFixed(2)),
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [enrichedSessions, cleanerDateFrom, cleanerDateTo])

  const workloadCards = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    )
    const weekStart = new Date(todayStart)
    const dayOfWeek = weekStart.getDay()
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    weekStart.setDate(weekStart.getDate() - diffToMonday)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let todayMinutes = 0
    let weekMinutes = 0
    let monthMinutes = 0

    enrichedSessions.forEach((session) => {
      if (!session.startDate || !session.durationMinutes) return
      const startTime = session.startDate.getTime()
      if (startTime >= todayStart.getTime())
        todayMinutes += session.durationMinutes
      if (startTime >= weekStart.getTime())
        weekMinutes += session.durationMinutes
      if (startTime >= monthStart.getTime())
        monthMinutes += session.durationMinutes
    })

    return [
      { label: "Today", value: formatTotalMinutes(todayMinutes) },
      { label: "Week", value: formatTotalMinutes(weekMinutes) },
      { label: "Month", value: formatTotalMinutes(monthMinutes) },
    ]
  }, [enrichedSessions, formatTotalMinutes])

  const handleOpenCleanerRecordEdit = (
    inRecordId: EntityId | null,
    inIsoValue: string | null,
    outRecordId: EntityId | null,
    outIsoValue: string | null,
  ) => {
    if (!inRecordId && !outRecordId) return
    setEditingCleanerRecord({
      inRecordId,
      inOriginalIso: inIsoValue,
      outRecordId,
      outOriginalIso: outIsoValue,
    })
    setEditedCleanerInTimeValue(toTimeInputValue(inIsoValue))
    setEditedCleanerOutTimeValue(toTimeInputValue(outIsoValue))
  }

  const handleSaveCleanerRecordEdit = async () => {
    if (!editingCleanerRecord) return

    try {
      setIsSavingCleanerRecordEdit(true)

      const updates: Promise<unknown>[] = []

      if (
        editingCleanerRecord.inRecordId &&
        editingCleanerRecord.inOriginalIso
      ) {
        if (!editedCleanerInTimeValue) {
          showErrorToast("Time IN is required")
          return
        }

        const [hoursRaw, minutesRaw] = editedCleanerInTimeValue.split(":")
        const hours = Number(hoursRaw)
        const minutes = Number(minutesRaw)
        if (
          Number.isNaN(hours) ||
          Number.isNaN(minutes) ||
          hours < 0 ||
          hours > 23 ||
          minutes < 0 ||
          minutes > 59
        ) {
          showErrorToast("Invalid Time IN")
          return
        }

        const nextInDate = new Date(editingCleanerRecord.inOriginalIso)
        if (Number.isNaN(nextInDate.getTime())) {
          showErrorToast("Invalid Time IN record date")
          return
        }
        nextInDate.setHours(hours, minutes, 0, 0)

        updates.push(
          apiCall(`/api/v1/acess/${editingCleanerRecord.inRecordId}`, {
            method: "PATCH",
            body: { data: nextInDate.toISOString() },
          }),
        )
      }

      if (
        editingCleanerRecord.outRecordId &&
        editingCleanerRecord.outOriginalIso
      ) {
        if (!editedCleanerOutTimeValue) {
          showErrorToast("Time OUT is required")
          return
        }

        const [hoursRaw, minutesRaw] = editedCleanerOutTimeValue.split(":")
        const hours = Number(hoursRaw)
        const minutes = Number(minutesRaw)
        if (
          Number.isNaN(hours) ||
          Number.isNaN(minutes) ||
          hours < 0 ||
          hours > 23 ||
          minutes < 0 ||
          minutes > 59
        ) {
          showErrorToast("Invalid Time OUT")
          return
        }

        const nextOutDate = new Date(editingCleanerRecord.outOriginalIso)
        if (Number.isNaN(nextOutDate.getTime())) {
          showErrorToast("Invalid Time OUT record date")
          return
        }
        nextOutDate.setHours(hours, minutes, 0, 0)

        updates.push(
          apiCall(`/api/v1/acess/${editingCleanerRecord.outRecordId}`, {
            method: "PATCH",
            body: { data: nextOutDate.toISOString() },
          }),
        )
      }

      await Promise.all(updates)
      await queryClient.invalidateQueries({
        queryKey: ["acess", "cleaner"],
      })
      setEditingCleanerRecord(null)
      showSuccessToast("Cleaner record updated successfully")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update cleaner record"
      showErrorToast(message)
    } finally {
      setIsSavingCleanerRecordEdit(false)
    }
  }

  const handleCleanerTimeOut = async (session: {
    inRecord?: AcessRecord
    outRecord?: AcessRecord
  }) => {
    if (!session.inRecord?.building_id || session.outRecord?.id) return

    const inRecordKey = String(session.inRecord.id)

    try {
      setIsCreatingCleanerTimeout(inRecordKey)
      await apiCall("/api/v1/acess/", {
        method: "POST",
        body: {
          building_id: session.inRecord.building_id,
          operacao: 1,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ["acess", "cleaner"],
      })
      showSuccessToast("Cleaner time out created successfully")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create cleaner time out"
      showErrorToast(message)
    } finally {
      setIsCreatingCleanerTimeout(null)
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
          Work summary
        </h3>
        {!activeCleanerId && (
          <span className="rounded-full bg-[#f5f1ee] px-3 py-1 text-xs font-semibold text-[#55311c]">
            Select an active cleaner from registration
          </span>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {workloadCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-bold text-[#55311c]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-[#55311c]">
            Hours by building
          </h4>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor="cleaner-building-date-from"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date from
              </label>
              <input
                id="cleaner-building-date-from"
                type="date"
                min={earliestCleanerSessionDate || undefined}
                max={
                  selectedCleanerDateTo || latestCleanerSessionDate || undefined
                }
                value={selectedCleanerDateFrom}
                onChange={(event) =>
                  setSelectedCleanerDateFrom(event.target.value)
                }
                className="rounded-lg border border-[#d9d0ca] bg-white px-3 py-1 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="cleaner-building-date-to"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
              >
                Date to
              </label>
              <input
                id="cleaner-building-date-to"
                type="date"
                min={
                  selectedCleanerDateFrom ||
                  earliestCleanerSessionDate ||
                  undefined
                }
                max={latestCleanerSessionDate || undefined}
                value={selectedCleanerDateTo}
                onChange={(event) =>
                  setSelectedCleanerDateTo(event.target.value)
                }
                className="rounded-lg border border-[#d9d0ca] bg-white px-3 py-1 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            {(selectedCleanerDateFrom || selectedCleanerDateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCleanerDateFrom("")
                  setSelectedCleanerDateTo("")
                }}
                className="rounded-lg border border-[#d9d0ca] px-3 py-1 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <p className="mb-3 text-xs text-[rgba(0,0,0,0.6)]">
          Period: {buildDateRangeLabel(cleanerDateFrom, cleanerDateTo)}
        </p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buildingHoursData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d0ca" />
              <XAxis
                dataKey="building"
                stroke="#55311c"
                tick={{ fill: "#55311c", fontSize: 12 }}
              />
              <YAxis
                stroke="#55311c"
                tick={{ fill: "#55311c", fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number) => [`${value}h`, "Hours"]}
                contentStyle={{
                  borderRadius: "10px",
                  border: "1px solid #e5e0dc",
                  backgroundColor: "#fff",
                }}
              />
              <Bar
                dataKey="hours"
                fill="#8c7569"
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!isLoadingAcess && buildingHoursData.length === 0 && (
          <p className="mt-3 text-sm text-[rgba(0,0,0,0.6)]">
            {selectedCleanerDateFrom || selectedCleanerDateTo
              ? "No closed sessions in the selected period."
              : "No closed sessions to generate chart."}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Date
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Building
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Time IN
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Time OUT
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Used
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoadingAcess && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={6}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!isLoadingAcess && tableSessions.length === 0 && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={6}
                >
                  No records found.
                </td>
              </tr>
            )}
            {tableSessions.map((session, index) => {
              const dateLabel = formatDate(
                session.inRecord?.data || session.outRecord?.data,
              )
              const canTimeOut = Boolean(
                session.inRecord?.id && !session.outRecord?.id,
              )
              const isTimingOut =
                isCreatingCleanerTimeout !== null &&
                isCreatingCleanerTimeout === String(session.inRecord?.id)

              return (
                <tr
                  key={`${session.inRecord?.id || "in"}-${session.outRecord?.id || "out"}-${index}`}
                  className="bg-white hover:bg-gray-50"
                >
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {dateLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {session.buildingLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatTime(session.inRecord?.data)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatTime(session.outRecord?.data)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatUsed(
                      session.inRecord?.data,
                      session.outRecord?.data,
                    )}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenCleanerRecordEdit(
                            session.inRecord?.id || null,
                            session.inRecord?.data || null,
                            session.outRecord?.id || null,
                            session.outRecord?.data || null,
                          )
                        }
                        disabled={
                          !session.inRecord?.id && !session.outRecord?.id
                        }
                        className="rounded bg-[#8c7569] px-2 py-1 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Edit
                      </button>
                      {canTimeOut && (
                        <button
                          type="button"
                          onClick={() => handleCleanerTimeOut(session)}
                          disabled={isTimingOut}
                          className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isTimingOut ? "Saving..." : "Time out"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingCleanerRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">
              Edit cleaner record
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Update the available times for this cleaner record.
            </p>

            <div className="mt-4 grid gap-4">
              {editingCleanerRecord.inRecordId &&
                editingCleanerRecord.inOriginalIso && (
                  <div>
                    <label
                      className="block text-sm font-semibold text-[#55311c]"
                      htmlFor="cleaner-edit-time-in"
                    >
                      Time IN
                    </label>
                    <input
                      id="cleaner-edit-time-in"
                      type="time"
                      value={editedCleanerInTimeValue}
                      onChange={(event) =>
                        setEditedCleanerInTimeValue(event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </div>
                )}
              {editingCleanerRecord.outRecordId &&
                editingCleanerRecord.outOriginalIso && (
                  <div>
                    <label
                      className="block text-sm font-semibold text-[#55311c]"
                      htmlFor="cleaner-edit-time-out"
                    >
                      Time OUT
                    </label>
                    <input
                      id="cleaner-edit-time-out"
                      type="time"
                      value={editedCleanerOutTimeValue}
                      onChange={(event) =>
                        setEditedCleanerOutTimeValue(event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </div>
                )}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditingCleanerRecord(null)}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCleanerRecordEdit}
                disabled={isSavingCleanerRecordEdit}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSavingCleanerRecordEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CleanerRegister() {
  const [showForm, setShowForm] = useState(false)
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { user } = useAuth()

  const { data: cleanersData, isLoading } = useQuery<
    ApiListResponse<Funcionario>
  >({
    queryKey: ["funcionarios", "cleaners"],
    queryFn: () => apiCall("/api/v1/funcionarios/", { skip: 0, limit: 500 }),
  })

  const cleaners = (cleanersData?.data || []).filter(
    (funcionario: Funcionario) => funcionario.cargo === 0,
  )

  const activeCleanerId = cleaners.find(
    (cleaner: Funcionario) => cleaner.is_default,
  )?.id

  interface NewCleanerPayload {
    status: boolean
    nome: string
    mobile: number
    cargo: number
    email: string | null
    condominio_id: EntityId
  }

  const createCleanerMutation = useMutation({
    mutationFn: (payload: NewCleanerPayload) =>
      apiCall("/api/v1/funcionarios/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Cleaner created successfully")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "cleaners"] })
      setShowForm(false)
      setNome("")
      setEmail("")
      setMobile("")
    },
    onError: () => {
      showErrorToast("Could not register cleaner")
    },
  })

  const setDefaultCleanerMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/funcionarios/${id}`, {
        method: "PATCH",
        body: { is_default: true },
      }),
    onSuccess: () => {
      showSuccessToast("Default cleaner updated")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "cleaners"] })
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "cleaners-summary"],
      })
    },
    onError: () => {
      showErrorToast("Could not update default cleaner")
    },
  })

  const handleSetActive = (cleaner: Funcionario) => {
    setDefaultCleanerMutation.mutate(cleaner.id)
  }

  const handleCreateCleaner = () => {
    if (!nome.trim()) {
      showErrorToast("Enter a name")
      return
    }

    if (!user?.condominio_id) {
      showErrorToast("User is not associated with a condominium")
      return
    }

    createCleanerMutation.mutate({
      status: true,
      nome: nome.trim(),
      mobile: mobile ? Number(mobile) : 0,
      cargo: 0,
      email: email || null,
      condominio_id: user.condominio_id,
    })
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
          Cleaner registration
        </h3>
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="flex items-center gap-2 rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Add cleaner</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add new cleaner
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="cleaner-name"
              >
                Name
              </label>
              <input
                type="text"
                id="cleaner-name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Cleaner name"
              />
            </div>
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="cleaner-email"
              >
                Email (optional)
              </label>
              <input
                type="email"
                id="cleaner-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="cleaner-mobile"
              >
                Phone
              </label>
              <input
                type="tel"
                id="cleaner-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Phone"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCleaner}
              className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Name
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Email
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Phone
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Active
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && cleaners.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  No cleaner registered.
                </td>
              </tr>
            )}
            {cleaners.map((cleaner) => (
              <tr key={cleaner.id} className="bg-white hover:bg-gray-50">
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  {cleaner.nome}
                </td>
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  {cleaner.email || "-"}
                </td>
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  {cleaner.mobile || "-"}
                </td>
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  <button
                    type="button"
                    onClick={() => handleSetActive(cleaner)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                      activeCleanerId === cleaner.id
                        ? "bg-[#8c7569] text-white"
                        : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
                    }`}
                  >
                    {activeCleanerId === cleaner.id ? "Active" : "Set active"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CaretakerSummary({
  activeTab,
  reportTrigger = 0,
}: {
  activeTab: "summary" | "bins"
  reportTrigger?: number
}) {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()
  const { data: caretakersData } = useQuery<ApiListResponse<Funcionario>>({
    queryKey: ["funcionarios", "caretakers-summary"],
    queryFn: () => apiCall("/api/v1/funcionarios/", { skip: 0, limit: 500 }),
  })

  const { data: workTimeData, isLoading: isLoadingWorkTime } = useQuery<
    ApiListResponse<WorkTimeSessionRecord>
  >({
    queryKey: ["acess", "caretaker", "work-time"],
    queryFn: () =>
      apiCall("/api/v1/acess/caretaker/work-time", { skip: 0, limit: 1000 }),
    refetchInterval: 30000,
  })

  const { data: binSessionsData, isLoading: isLoadingBinSessions } = useQuery<
    ApiListResponse<BinSessionRecord>
  >({
    queryKey: ["bins", "sessions", "caretaker-summary"],
    queryFn: () => apiCall("/api/v1/bins/sessions", { skip: 0, limit: 1000 }),
    refetchInterval: 30000,
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings", "caretaker-summary"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const workTimeRecordsRaw = (workTimeData?.data ||
    []) as WorkTimeSessionRecord[]
  const binSessionsRaw = (binSessionsData?.data || []) as BinSessionRecord[]
  const buildings = (buildingsData?.data || []) as Building[]

  const buildingMap = useMemo(() => {
    const map = new Map<EntityId, string>()
    buildings.forEach((building) => {
      map.set(building.id, building.nome)
    })
    return map
  }, [buildings])

  const activeCaretakerId = useMemo(() => {
    const caretakers = (caretakersData?.data || []).filter(
      (funcionario: Funcionario) => funcionario.cargo === 1,
    )
    return (
      caretakers.find((caretaker: Funcionario) => caretaker.is_default)?.id ||
      null
    )
  }, [caretakersData])

  const activeCaretakerName = useMemo(() => {
    const caretakers = (caretakersData?.data || []).filter(
      (funcionario: Funcionario) => funcionario.cargo === 1,
    )
    const activeCaretaker = caretakers.find(
      (caretaker: Funcionario) => caretaker.is_default,
    )
    if (activeCaretaker?.nome?.trim()) return activeCaretaker.nome.trim()
    if (caretakers[0]?.nome?.trim()) return caretakers[0].nome.trim()
    return "Caretaker"
  }, [caretakersData])

  const workTimeRecords = useMemo(() => {
    if (!activeCaretakerId) return workTimeRecordsRaw
    return workTimeRecordsRaw.filter(
      (record) => record.funcionario_id === activeCaretakerId,
    )
  }, [workTimeRecordsRaw, activeCaretakerId])
  const binSessions = useMemo(() => {
    if (!activeCaretakerId) return binSessionsRaw
    return binSessionsRaw.filter(
      (record) => record.funcionario_id === activeCaretakerId,
    )
  }, [binSessionsRaw, activeCaretakerId])

  const [selectedWorkDate, setSelectedWorkDate] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  })
  const [selectedBinsDateFrom, setSelectedBinsDateFrom] = useState("")
  const [selectedBinsDateTo, setSelectedBinsDateTo] = useState("")
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    getWeekStartIso(new Date()),
  )
  const [reportDateFrom, setReportDateFrom] = useState("")
  const [reportDateTo, setReportDateTo] = useState("")
  const [reportEmail, setReportEmail] = useState("")
  const [isSendingReport, setIsSendingReport] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [editingCaretakerRecord, setEditingCaretakerRecord] =
    useState<CaretakerRecordEditState | null>(null)
  const [editedCaretakerTimeValue, setEditedCaretakerTimeValue] = useState("")
  const [isSavingCaretakerRecordEdit, setIsSavingCaretakerRecordEdit] =
    useState(false)

  const workTimeSessionsGrouped = useMemo(() => {
    const sorted = [...workTimeRecords]
      .filter((record) => record?.data)
      .sort(
        (a, b) =>
          new Date(a.data ?? 0).getTime() - new Date(b.data ?? 0).getTime(),
      )

    const result: Array<{
      inRecord?: WorkTimeSessionRecord
      outRecord?: WorkTimeSessionRecord
    }> = []
    let openRecord: WorkTimeSessionRecord | null = null

    sorted.forEach((record) => {
      if (record.operacao === 0) {
        if (!openRecord) openRecord = record
      } else if (record.operacao === 1) {
        if (openRecord) {
          result.push({ inRecord: openRecord, outRecord: record })
          openRecord = null
        } else {
          result.push({ outRecord: record })
        }
      }
    })

    if (openRecord) result.push({ inRecord: openRecord })
    return result.reverse()
  }, [workTimeRecords])

  const formatDate = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleDateString("en-GB")
  }

  const formatTime = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const toTimeInputValue = (dateValue?: string | null) => {
    if (!dateValue) return ""
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return ""
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
  }

  const formatUsed = (inValue?: string | null, outValue?: string | null) => {
    if (!inValue || !outValue) return "-"
    const start = new Date(inValue).getTime()
    const end = new Date(outValue).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "-"
    const diffMinutes = Math.floor((end - start) / 60000)
    if (diffMinutes >= 1440) return "No exit this day"
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    if (hours <= 0) return `${minutes}m`
    return `${hours}h ${minutes}m`
  }

  const getDurationMinutes = (
    inValue?: string | null,
    outValue?: string | null,
    allowOpenSession = false,
  ) => {
    if (!inValue) return 0
    const start = new Date(inValue).getTime()
    const end = outValue
      ? new Date(outValue).getTime()
      : allowOpenSession
        ? Date.now()
        : NaN
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
    const diffMinutes = Math.floor((end - start) / 60000)
    if (diffMinutes >= 1440) return 0
    return diffMinutes
  }

  const toDateKey = (dateValue?: string | null) => {
    if (!dateValue) return ""
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return ""
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const currentWeekStart = useMemo(() => getWeekStartIso(new Date()), [])
  const selectedWeekEnd = useMemo(
    () => addDaysToIso(selectedWeekStart, 6),
    [selectedWeekStart],
  )
  const earliestWeekStart = useMemo(() => {
    const earliestDate = workTimeSessionsGrouped
      .map((session) =>
        toDateKey(session.inRecord?.data || session.outRecord?.data),
      )
      .filter(Boolean)
      .sort()[0]
    return earliestDate ? getWeekStartIso(earliestDate) : currentWeekStart
  }, [currentWeekStart, workTimeSessionsGrouped, toDateKey])

  const weekRangeLabel = useMemo(
    () =>
      `${formatDateToBr(selectedWeekStart)} - ${formatDateToBr(selectedWeekEnd)}`,
    [selectedWeekEnd, selectedWeekStart],
  )

  const workTimeDayHours = useMemo(() => {
    let totalMinutes = 0
    workTimeSessionsGrouped.forEach((session) => {
      const duration = getDurationMinutes(
        session.inRecord?.data,
        session.outRecord?.data,
        false,
      )
      if (!duration) return
      const sessionDate = toDateKey(
        session.inRecord?.data || session.outRecord?.data,
      )
      if (sessionDate !== selectedWorkDate) return
      totalMinutes += duration
    })
    return Number((totalMinutes / 60).toFixed(2))
  }, [workTimeSessionsGrouped, selectedWorkDate, getDurationMinutes, toDateKey])

  const workTimeChartData = useMemo(
    () => [{ label: "WORK TIME", hours: workTimeDayHours }],
    [workTimeDayHours],
  )

  const workTimeWeekHours = useMemo(() => {
    let totalMinutes = 0
    workTimeSessionsGrouped.forEach((session) => {
      const sessionDate = toDateKey(
        session.inRecord?.data || session.outRecord?.data,
      )
      if (!isIsoDateWithinWeek(sessionDate, selectedWeekStart)) return

      totalMinutes += getDurationMinutes(
        session.inRecord?.data,
        session.outRecord?.data,
        false,
      )
    })
    return Number((totalMinutes / 60).toFixed(2))
  }, [
    getDurationMinutes,
    selectedWeekStart,
    workTimeSessionsGrouped,
    toDateKey,
  ])

  const remainingWeeklyTargetHours = useMemo(
    () => Math.max(20 - workTimeWeekHours, 0),
    [workTimeWeekHours],
  )

  const binSessionsGrouped = useMemo(() => {
    const sorted = [...binSessions]
      .filter((record) => record?.data)
      .sort(
        (a, b) =>
          new Date(a.data ?? 0).getTime() - new Date(b.data ?? 0).getTime(),
      )

    const result: Array<{
      inRecord?: BinSessionRecord
      outRecord?: BinSessionRecord
    }> = []
    let openRecord: BinSessionRecord | null = null
    sorted.forEach((record) => {
      if (record.operacao === 0) {
        if (!openRecord) openRecord = record
      } else if (record.operacao === 1) {
        if (openRecord) {
          result.push({ inRecord: openRecord, outRecord: record })
          openRecord = null
        }
      }
    })
    if (openRecord) result.push({ inRecord: openRecord })
    return result
  }, [binSessions])

  const { earliestBinSessionDate, latestBinSessionDate } = useMemo(() => {
    const dates = binSessionsGrouped
      .map((session) =>
        toDateKey(session.inRecord?.data || session.outRecord?.data),
      )
      .filter(Boolean)
      .sort()

    return {
      earliestBinSessionDate: dates[0] || "",
      latestBinSessionDate: dates[dates.length - 1] || "",
    }
  }, [binSessionsGrouped, toDateKey])

  const { binsDateFrom, binsDateTo } = useMemo(() => {
    if (
      selectedBinsDateFrom &&
      selectedBinsDateTo &&
      selectedBinsDateFrom > selectedBinsDateTo
    ) {
      return {
        binsDateFrom: selectedBinsDateTo,
        binsDateTo: selectedBinsDateFrom,
      }
    }

    return {
      binsDateFrom: selectedBinsDateFrom,
      binsDateTo: selectedBinsDateTo,
    }
  }, [selectedBinsDateFrom, selectedBinsDateTo])

  const binsTimeByBuilding = useMemo(() => {
    const totals = new Map<string, number>()
    binSessionsGrouped.forEach((session) => {
      const sessionDate = toDateKey(
        session.inRecord?.data || session.outRecord?.data,
      )
      if (!isDateWithinRange(sessionDate, binsDateFrom, binsDateTo)) return

      const duration = getDurationMinutes(
        session.inRecord?.data,
        session.outRecord?.data,
        true,
      )
      if (!duration) return
      const buildingId =
        session.inRecord?.building_id || session.outRecord?.building_id
      const buildingLabel =
        (buildingId && buildingMap.get(buildingId)) ||
        session.inRecord?.building_nome ||
        session.outRecord?.building_nome ||
        "-"
      const current = totals.get(buildingLabel) || 0
      totals.set(buildingLabel, current + duration)
    })
    return [...totals.entries()]
      .map(([building, minutes]) => ({
        building,
        hours: Number((minutes / 60).toFixed(2)),
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [
    binSessionsGrouped,
    binsDateFrom,
    binsDateTo,
    buildingMap,
    getDurationMinutes,
    toDateKey,
  ])

  const binHistoryRows = useMemo(() => {
    return binSessionsGrouped.map((session, index) => {
      const buildingId =
        session.inRecord?.building_id || session.outRecord?.building_id
      const buildingLabel =
        (buildingId && buildingMap.get(buildingId)) ||
        session.inRecord?.building_nome ||
        session.outRecord?.building_nome ||
        "-"
      const dateValue =
        session.inRecord?.data || session.outRecord?.data || null
      const sortTime = dateValue ? new Date(dateValue).getTime() : 0
      return {
        key: `bins-${index}-${session.inRecord?.id || "in"}-${session.outRecord?.id || "out"}`,
        kind: "bins" as const,
        buildingLabel,
        inValue: session.inRecord?.data || null,
        outValue: session.outRecord?.data || null,
        inRecordId: session.inRecord?.id || null,
        outRecordId: session.outRecord?.id || null,
        sortTime,
      }
    })
  }, [binSessionsGrouped, buildingMap])

  const workTimeHistoryRows = useMemo(() => {
    return workTimeSessionsGrouped.map((session, index) => {
      const dateValue =
        session.inRecord?.data || session.outRecord?.data || null
      const sortTime = dateValue ? new Date(dateValue).getTime() : 0
      return {
        key: `work-time-${index}-${session.inRecord?.id || "in"}-${session.outRecord?.id || "out"}`,
        kind: "work-time" as const,
        buildingLabel: "WORK TIME",
        inValue: session.inRecord?.data || null,
        outValue: session.outRecord?.data || null,
        inRecordId: session.inRecord?.id || null,
        outRecordId: session.outRecord?.id || null,
        sortTime,
      }
    })
  }, [workTimeSessionsGrouped])

  const visibleHistoryRows = useMemo(() => {
    const sourceRows =
      activeTab === "summary" ? workTimeHistoryRows : binHistoryRows
    const filteredRows =
      activeTab === "summary"
        ? sourceRows.filter((row) =>
            isIsoDateWithinWeek(
              toDateKey(row.inValue || row.outValue),
              selectedWeekStart,
            ),
          )
        : sourceRows
    return [...filteredRows]
      .sort((a, b) => b.sortTime - a.sortTime)
      .slice(0, 20)
  }, [
    activeTab,
    binHistoryRows,
    selectedWeekStart,
    toDateKey,
    workTimeHistoryRows,
  ])

  useEffect(() => {
    if (activeTab !== "summary") return
    if (isIsoDateWithinWeek(selectedWorkDate, selectedWeekStart)) return

    const todayIso = toIsoDateString(new Date())
    setSelectedWorkDate(
      isIsoDateWithinWeek(todayIso, selectedWeekStart)
        ? todayIso
        : selectedWeekStart,
    )
  }, [activeTab, selectedWeekStart, selectedWorkDate])

  const formatDurationFromMinutes = (minutes: number) => {
    if (minutes <= 0) return "0m"
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (hours <= 0) return `${remainingMinutes}m`
    if (remainingMinutes === 0) return `${hours}h`
    return `${hours}h ${remainingMinutes}m`
  }

  const handleSendWorkTimeReport = async () => {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      showErrorToast("Invalid date range")
      return
    }
    if (!reportEmail.trim()) {
      showErrorToast("Email is required")
      return
    }

    const filteredSessions = workTimeSessionsGrouped.filter((session) =>
      isDateWithinRange(
        session.inRecord?.data || session.outRecord?.data || "",
        reportDateFrom,
        reportDateTo,
      ),
    )

    if (filteredSessions.length === 0) {
      showErrorToast("No work time sessions found in the selected range")
      return
    }

    let totalMinutes = 0
    const rows = filteredSessions.map((session) => {
      const usedMinutes = getDurationMinutes(
        session.inRecord?.data,
        session.outRecord?.data,
        false,
      )
      totalMinutes += usedMinutes

      return [
        formatDate(session.inRecord?.data || session.outRecord?.data || null),
        formatTime(session.inRecord?.data || null),
        formatTime(session.outRecord?.data || null),
        formatUsed(
          session.inRecord?.data || null,
          session.outRecord?.data || null,
        ),
        session.outRecord?.data ? "Closed" : "Open",
      ]
    })

    rows.push(["Total", "-", "-", formatDurationFromMinutes(totalMinutes), "-"])

    const reportTitle = "Caretaker Work Time Report"
    const periodLabel = buildDateRangeLabel(reportDateFrom, reportDateTo)
    const fileName = `caretaker-work-time-${new Date().toISOString().slice(0, 10)}.pdf`
    const fileDataBase64 = generatePdfTableReportBase64({
      title: `${reportTitle} - ${activeCaretakerName}`,
      dateRange: `${periodLabel} | Total worked: ${formatDurationFromMinutes(totalMinutes)}`,
      headers: ["Date", "Time IN", "Time OUT", "Used", "Status"],
      rows,
    })

    if (!fileDataBase64) {
      showErrorToast("Failed to prepare report file")
      return
    }

    try {
      setIsSendingReport(true)
      await apiCall("/api/v1/utils/send-report-email/", {
        method: "POST",
        body: {
          email_to: reportEmail.trim(),
          subject: `${reportTitle} - ${activeCaretakerName}`,
          html_content: buildWorkTimeReportEmailHtml({
            caretakerName: activeCaretakerName,
            periodLabel,
          }),
          file_name: fileName,
          file_data_base64: fileDataBase64,
        },
      })
      setShowReportModal(false)
      showSuccessToast("Work time report sent successfully")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send work time report by email"
      showErrorToast(message)
    } finally {
      setIsSendingReport(false)
    }
  }

  const handleOpenCaretakerRecordEdit = (
    recordId: EntityId | null,
    isoValue: string | null,
    label: "Time IN" | "Time OUT",
    recordType: "work-time" | "bins",
  ) => {
    if (!recordId || !isoValue) return
    setEditingCaretakerRecord({
      recordId,
      originalIso: isoValue,
      label,
      recordType,
    })
    setEditedCaretakerTimeValue(toTimeInputValue(isoValue))
  }

  const handleSaveCaretakerRecordEdit = async () => {
    if (!editingCaretakerRecord) return
    if (!editedCaretakerTimeValue) {
      showErrorToast("Time is required")
      return
    }

    const [hoursRaw, minutesRaw] = editedCaretakerTimeValue.split(":")
    const hours = Number(hoursRaw)
    const minutes = Number(minutesRaw)
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      showErrorToast("Invalid time")
      return
    }

    const nextDate = new Date(editingCaretakerRecord.originalIso)
    if (Number.isNaN(nextDate.getTime())) {
      showErrorToast("Invalid original record date")
      return
    }
    nextDate.setHours(hours, minutes, 0, 0)

    const isWorkTimeEdit = editingCaretakerRecord.recordType === "work-time"
    const apiPath = isWorkTimeEdit
      ? `/api/v1/acess/caretaker/work-time/${editingCaretakerRecord.recordId}`
      : `/api/v1/bins/sessions/${editingCaretakerRecord.recordId}`
    const queryKey = isWorkTimeEdit
      ? ["acess", "caretaker", "work-time"]
      : ["bins", "sessions", "caretaker-summary"]
    const successMessage = isWorkTimeEdit
      ? "Work time updated successfully"
      : "Bin session updated successfully"
    const errorFallback = isWorkTimeEdit
      ? "Failed to update work time"
      : "Failed to update bin session"

    try {
      setIsSavingCaretakerRecordEdit(true)
      await apiCall(apiPath, {
        method: "PATCH",
        body: { data: nextDate.toISOString() },
      })
      await queryClient.invalidateQueries({
        queryKey,
      })
      setEditingCaretakerRecord(null)
      showSuccessToast(successMessage)
    } catch (error) {
      const message = error instanceof Error ? error.message : errorFallback
      showErrorToast(message)
    } finally {
      setIsSavingCaretakerRecordEdit(false)
    }
  }

  useEffect(() => {
    if (reportTrigger > 0) {
      setShowReportModal(true)
    }
  }, [reportTrigger])

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
          {activeTab === "summary" ? "Work summary" : "Bins"}
        </h3>
      </div>

      {activeTab === "summary" ? (
        <>
          <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]">
                  Weekly Hours
                </p>
                <div className="mt-2 flex items-end gap-3">
                  <span className="font-['Nunito',sans-serif] text-4xl font-bold text-[#55311c]">
                    {workTimeWeekHours.toFixed(2)}h
                  </span>
                  <span className="pb-1 text-sm text-[rgba(85,49,28,0.72)]">
                    {weekRangeLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[rgba(85,49,28,0.72)]">
                  {remainingWeeklyTargetHours.toFixed(2)}h left to reach 20h
                </p>
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                <span className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]">
                  Week Filter
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedWeekStart((current) =>
                        addWeeksToIso(current, -1),
                      )
                    }
                    disabled={selectedWeekStart <= earliestWeekStart}
                    className="rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous week
                  </button>
                  <div className="min-w-[180px] rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-center text-sm font-semibold text-[#55311c]">
                    {weekRangeLabel}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedWeekStart((current) =>
                        addWeeksToIso(current, 1),
                      )
                    }
                    disabled={selectedWeekStart >= currentWeekStart}
                    className="rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next week
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-semibold text-[#55311c]">
                WORK TIME
              </h4>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="caretaker-worktime-day"
                  className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Day
                </label>
                <input
                  id="caretaker-worktime-day"
                  type="date"
                  min={selectedWeekStart}
                  max={selectedWeekEnd}
                  value={selectedWorkDate}
                  onChange={(event) => setSelectedWorkDate(event.target.value)}
                  className="rounded-lg border border-[#d9d0ca] bg-white px-3 py-1 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={workTimeChartData}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9d0ca" />
                  <XAxis
                    type="number"
                    stroke="#55311c"
                    tick={{ fill: "#55311c", fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={90}
                    stroke="#55311c"
                    tick={{ fill: "#55311c", fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}h`, "Hours"]}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e5e0dc",
                      backgroundColor: "#fff",
                    }}
                  />
                  <Bar
                    dataKey="hours"
                    fill="#8c7569"
                    radius={[0, 8, 8, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!isLoadingWorkTime && workTimeDayHours === 0 && (
              <p className="mt-3 text-sm text-[rgba(0,0,0,0.6)]">
                No WORK TIME sessions on the selected day.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="text-sm font-semibold text-[#55311c]">
              Hours per Building (Bins)
            </h4>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label
                  htmlFor="bins-building-date-from"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Date from
                </label>
                <input
                  id="bins-building-date-from"
                  type="date"
                  min={earliestBinSessionDate || undefined}
                  max={selectedBinsDateTo || latestBinSessionDate || undefined}
                  value={selectedBinsDateFrom}
                  onChange={(event) =>
                    setSelectedBinsDateFrom(event.target.value)
                  }
                  className="rounded-lg border border-[#d9d0ca] bg-white px-3 py-1 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="bins-building-date-to"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Date to
                </label>
                <input
                  id="bins-building-date-to"
                  type="date"
                  min={
                    selectedBinsDateFrom || earliestBinSessionDate || undefined
                  }
                  max={latestBinSessionDate || undefined}
                  value={selectedBinsDateTo}
                  onChange={(event) =>
                    setSelectedBinsDateTo(event.target.value)
                  }
                  className="rounded-lg border border-[#d9d0ca] bg-white px-3 py-1 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              {(selectedBinsDateFrom || selectedBinsDateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBinsDateFrom("")
                    setSelectedBinsDateTo("")
                  }}
                  className="rounded-lg border border-[#d9d0ca] px-3 py-1 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <p className="mb-3 text-xs text-[rgba(0,0,0,0.6)]">
            Period: {buildDateRangeLabel(binsDateFrom, binsDateTo)}
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={binsTimeByBuilding}
                margin={{ left: 10, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#d9d0ca" />
                <XAxis
                  type="category"
                  dataKey="building"
                  stroke="#55311c"
                  tick={{ fill: "#55311c", fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  width={90}
                  stroke="#55311c"
                  tick={{ fill: "#55311c", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}h`, "Hours"]}
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e5e0dc",
                    backgroundColor: "#fff",
                  }}
                />
                <Bar
                  dataKey="hours"
                  name="Bins"
                  fill="#2d8659"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!isLoadingBinSessions && binsTimeByBuilding.length === 0 && (
            <p className="mt-3 text-sm text-[rgba(0,0,0,0.6)]">
              {selectedBinsDateFrom || selectedBinsDateTo
                ? "No sessions in the selected period."
                : "No sessions to generate chart."}
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Date
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Building
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Time IN
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Time OUT
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Used
              </th>
            </tr>
          </thead>
          <tbody>
            {((activeTab === "summary" && isLoadingWorkTime) ||
              (activeTab === "bins" && isLoadingBinSessions)) && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={5}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!isLoadingBinSessions &&
              !isLoadingWorkTime &&
              visibleHistoryRows.length === 0 && (
                <tr>
                  <td
                    className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                    colSpan={5}
                  >
                    No records found.
                  </td>
                </tr>
              )}
            {visibleHistoryRows.map((row) => {
              const dateLabel = formatDate(row.inValue || row.outValue)

              return (
                <tr key={row.key} className="bg-white hover:bg-gray-50">
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {dateLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {row.buildingLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      <span>{formatTime(row.inValue)}</span>
                      {row.inValue && row.inRecordId && (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCaretakerRecordEdit(
                              row.inRecordId,
                              row.inValue,
                              "Time IN",
                              row.kind,
                            )
                          }
                          className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      <span>{formatTime(row.outValue)}</span>
                      {row.outValue && row.outRecordId && (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCaretakerRecordEdit(
                              row.outRecordId,
                              row.outValue,
                              "Time OUT",
                              row.kind,
                            )
                          }
                          className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatUsed(row.inValue, row.outValue)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">
              Generate work time report
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Enter email and optional date range to send the caretaker work
              time PDF report.
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="caretaker-report-email"
                >
                  Email
                </label>
                <input
                  id="caretaker-report-email"
                  type="email"
                  value={reportEmail}
                  onChange={(event) => setReportEmail(event.target.value)}
                  placeholder="report@email.com"
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="caretaker-report-date-from"
                >
                  Start date
                </label>
                <input
                  id="caretaker-report-date-from"
                  type="date"
                  value={reportDateFrom}
                  onChange={(event) => setReportDateFrom(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="caretaker-report-date-to"
                >
                  End date
                </label>
                <input
                  id="caretaker-report-date-to"
                  type="date"
                  min={reportDateFrom || undefined}
                  value={reportDateTo}
                  onChange={(event) => setReportDateTo(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendWorkTimeReport}
                disabled={isSendingReport}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSendingReport ? "Sending..." : "Send by email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCaretakerRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">
              Edit caretaker record
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Update the {editingCaretakerRecord.label.toLowerCase()} for this{" "}
              {editingCaretakerRecord.recordType === "work-time"
                ? "work time"
                : "bins"}{" "}
              record.
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="caretaker-edit-time"
                >
                  {editingCaretakerRecord.label}
                </label>
                <input
                  id="caretaker-edit-time"
                  type="time"
                  value={editedCaretakerTimeValue}
                  onChange={(event) =>
                    setEditedCaretakerTimeValue(event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditingCaretakerRecord(null)}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCaretakerRecordEdit}
                disabled={isSavingCaretakerRecordEdit}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSavingCaretakerRecordEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CaretakerRegister() {
  const [showForm, setShowForm] = useState(false)
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { user } = useAuth()

  const { data: caretakersData, isLoading } = useQuery<
    ApiListResponse<Funcionario>
  >({
    queryKey: ["funcionarios", "caretakers"],
    queryFn: () => apiCall("/api/v1/funcionarios/", { skip: 0, limit: 500 }),
  })

  const caretakers = (caretakersData?.data || []).filter(
    (funcionario: Funcionario) => funcionario.cargo === 1,
  )

  const activeCaretakerId = caretakers.find(
    (caretaker: Funcionario) => caretaker.is_default,
  )?.id

  interface NewCaretakerPayload {
    status: boolean
    nome: string
    mobile: number
    cargo: number
    email: string | null
    condominio_id: EntityId
  }

  const createCaretakerMutation = useMutation({
    mutationFn: (payload: NewCaretakerPayload) =>
      apiCall("/api/v1/funcionarios/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Caretaker created successfully")
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "caretakers"],
      })
      setShowForm(false)
      setNome("")
      setEmail("")
      setMobile("")
    },
    onError: () => {
      showErrorToast("Could not register caretaker")
    },
  })

  const setDefaultCaretakerMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/funcionarios/${id}`, {
        method: "PATCH",
        body: { is_default: true },
      }),
    onSuccess: () => {
      showSuccessToast("Default caretaker updated")
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "caretakers"],
      })
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "caretakers-summary"],
      })
    },
    onError: () => {
      showErrorToast("Could not update default caretaker")
    },
  })

  const handleSetActive = (caretaker: Funcionario) => {
    setDefaultCaretakerMutation.mutate(caretaker.id)
  }

  const handleCreateCaretaker = () => {
    if (!nome.trim()) {
      showErrorToast("Enter a name")
      return
    }

    if (!user?.condominio_id) {
      showErrorToast("User is not associated with a condominium")
      return
    }

    createCaretakerMutation.mutate({
      status: true,
      nome: nome.trim(),
      mobile: mobile ? Number(mobile) : 0,
      cargo: 1,
      email: email || null,
      condominio_id: user.condominio_id,
    })
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
          Caretaker registration
        </h3>
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="flex items-center gap-2 rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Add caretaker</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add new caretaker
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="caretaker-name"
              >
                Name
              </label>
              <input
                type="text"
                id="caretaker-name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Caretaker name"
              />
            </div>
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="caretaker-email"
              >
                Email (optional)
              </label>
              <input
                type="email"
                id="caretaker-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="caretaker-mobile"
              >
                Phone
              </label>
              <input
                type="tel"
                id="caretaker-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Phone"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCaretaker}
              className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Name
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Email
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Phone
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Active
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && caretakers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  No caretaker registered.
                </td>
              </tr>
            )}
            {caretakers.map((caretaker) => (
              <tr key={caretaker.id} className="bg-white hover:bg-gray-50">
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  {caretaker.nome}
                </td>
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  {caretaker.email || "-"}
                </td>
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  {caretaker.mobile || "-"}
                </td>
                <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                  <button
                    type="button"
                    onClick={() => handleSetActive(caretaker)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                      activeCaretakerId === caretaker.id
                        ? "bg-[#8c7569] text-white"
                        : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
                    }`}
                  >
                    {activeCaretakerId === caretaker.id
                      ? "Active"
                      : "Set active"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResidentsContent() {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<EntityId | null>(null)
  const [editContext, setEditContext] = useState<ResidentEditContext | null>(
    null,
  )
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [residentTypeFilter, setResidentTypeFilter] =
    useState<ResidentTypeFilter>("owner_1")
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const pageSize = 20

  const { data: ResidentsData, isLoading } = useQuery<
    ApiListResponse<Morador> & { count?: number }
  >({
    queryKey: ["Residents", selectedBuilding, searchTerm],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const pageLimit = 100
      const allResidents: Morador[] = []
      let skip = 0
      let totalCount: number | undefined

      while (true) {
        const params = new URLSearchParams()
        params.append("skip", String(skip))
        params.append("limit", String(pageLimit))
        if (searchTerm) params.append("search", searchTerm)
        if (selectedBuilding && !searchTerm)
          params.append("building", selectedBuilding)

        const page = (await apiCall(
          `/api/v1/moradores/?${params.toString()}`,
        )) as ApiListResponse<Morador> & { count?: number }

        const pageData = page.data || []
        totalCount = page.count
        allResidents.push(...pageData)

        if (pageData.length < pageLimit) break
        if (typeof totalCount === "number" && allResidents.length >= totalCount)
          break

        skip += pageLimit
      }

      return {
        data: allResidents,
        count: totalCount ?? allResidents.length,
      }
    },
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const Residents = ResidentsData?.data || []
  const buildings = buildingsData?.data || []

  const sortedResidents = useMemo(
    () =>
      [...Residents].sort((a, b) => {
        const buildingCompare = a.building_nome.localeCompare(b.building_nome)
        if (buildingCompare !== 0) return buildingCompare
        if (a.flat_numero !== b.flat_numero)
          return a.flat_numero - b.flat_numero
        const flatLabelCompare = (a.flat_label || "").localeCompare(
          b.flat_label || "",
        )
        if (flatLabelCompare !== 0) return flatLabelCompare
        return a.nome.localeCompare(b.nome)
      }),
    [Residents],
  )

  const RoleFilterMap: Record<Exclude<ResidentTypeFilter, "all">, number> = {
    owner_1: 0,
    owner_2: 1,
    tenant: 2,
    agent: 3,
  }

  const filteredResidents = useMemo(() => {
    if (residentTypeFilter === "all") return sortedResidents
    return sortedResidents.filter(
      (morador) => morador.cargo === RoleFilterMap[residentTypeFilter],
    )
  }, [sortedResidents, residentTypeFilter, RoleFilterMap])

  const groupedFlatRows = useMemo<FlatResidentRow[]>(() => {
    if (residentTypeFilter !== "all") return []

    const groups = new Map<string, FlatResidentRow>()

    filteredResidents.forEach((morador) => {
      const key = `${morador.building_nome}::${morador.flat_numero}::${morador.flat_id}`
      const current = groups.get(key) ?? {
        key,
        building_nome: morador.building_nome,
        flat_numero: morador.flat_numero,
        flat_label: morador.flat_label,
        reading_types: morador.reading_types,
        edit_target_id: null,
      }

      if (morador.cargo === 0 && !current.owner_1) current.owner_1 = morador
      if (morador.cargo === 1 && !current.owner_2) current.owner_2 = morador
      if (morador.cargo === 2 && !current.tenant) current.tenant = morador
      if (morador.cargo === 3 && !current.agent) current.agent = morador
      current.reading_types = morador.reading_types
      current.edit_target_id =
        current.owner_1?.id ??
        current.owner_2?.id ??
        current.tenant?.id ??
        current.agent?.id ??
        null

      groups.set(key, current)
    })

    return [...groups.values()].sort((a, b) => {
      const buildingCompare = a.building_nome.localeCompare(b.building_nome)
      if (buildingCompare !== 0) return buildingCompare
      if (a.flat_numero !== b.flat_numero) return a.flat_numero - b.flat_numero
      return (a.flat_label || "").localeCompare(b.flat_label || "")
    })
  }, [filteredResidents, residentTypeFilter])

  const isAllTypeView = residentTypeFilter === "all"
  const totalCount = isAllTypeView
    ? groupedFlatRows.length
    : filteredResidents.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    setCurrentPage(0)
  }, [])

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1))
    }
  }, [currentPage, totalPages])

  const paginatedResidents = useMemo(() => {
    if (isAllTypeView) return []
    const start = currentPage * pageSize
    return filteredResidents.slice(start, start + pageSize)
  }, [filteredResidents, currentPage, isAllTypeView])

  const paginatedFlatRows = useMemo(() => {
    if (!isAllTypeView) return []
    const start = currentPage * pageSize
    return groupedFlatRows.slice(start, start + pageSize)
  }, [groupedFlatRows, currentPage, isAllTypeView])

  const updateReadingTypesMutation = useMutation({
    mutationFn: async ({
      id,
      readingTypes,
    }: {
      id: EntityId
      readingTypes: number
    }) => {
      const response = await apiCall(`/api/v1/moradores/${id}/reading-types`, {
        method: "PATCH",
        body: { reading_types: readingTypes },
      })
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["Residents"] })
      showSuccessToast("Reading types updated successfully!")
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Error updating reading types"
      showErrorToast(message)
    },
  })

  const updateReadingSmsMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: EntityId; enabled: boolean }) => {
      const response = await apiCall(`/api/v1/moradores/${id}`, {
        method: "PATCH",
        body: { receives_flat_reading_sms: enabled },
      })
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["Residents"] })
      showSuccessToast("Reading SMS preference updated successfully!")
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Error updating reading SMS preference"
      showErrorToast(message)
    },
  })

  const updateTwilioSmsMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: EntityId; enabled: boolean }) => {
      const response = await apiCall(`/api/v1/moradores/${id}`, {
        method: "PATCH",
        body: { receives_twilio_sms: enabled },
      })
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["Residents"] })
      showSuccessToast("Twilio SMS preference updated successfully!")
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Error updating Twilio SMS preference"
      showErrorToast(message)
    },
  })

  const handleCheckboxChange = (
    id: EntityId,
    currentTypes: number,
    typeValue: number,
  ) => {
    // Flats do not support Low (bit 1), always keep it disabled.
    const baseTypes = currentTypes & ~1
    let newTypes = baseTypes
    if (baseTypes & typeValue) {
      // Remove this type
      newTypes = baseTypes & ~typeValue
    } else {
      // Add this type
      newTypes = baseTypes | typeValue
    }
    updateReadingTypesMutation.mutate({ id, readingTypes: newTypes })
  }

  const handleBuildingChange = (building: string | null) => {
    setSelectedBuilding(building)
    setCurrentPage(0)
  }

  const handleReadingSmsToggle = (id: EntityId, enabled: boolean) => {
    updateReadingSmsMutation.mutate({ id, enabled })
  }

  const handleTwilioSmsToggle = (id: EntityId, enabled: boolean) => {
    updateTwilioSmsMutation.mutate({ id, enabled })
  }

  const renderReadingSmsToggle = (morador?: Morador) => {
    if (!morador)
      return <span className="text-xs text-[rgba(85,49,28,0.55)]">-</span>
    return (
      <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#55311c]">
        <input
          type="checkbox"
          checked={morador.receives_flat_reading_sms}
          onChange={(event) =>
            handleReadingSmsToggle(morador.id, event.target.checked)
          }
          disabled={updateReadingSmsMutation.isPending}
          className="h-4 w-4 cursor-pointer"
        />
        Receive readings
      </label>
    )
  }

  const renderTwilioSmsToggle = (morador?: Morador) => {
    if (!morador)
      return <span className="text-xs text-[rgba(85,49,28,0.55)]">-</span>
    return (
      <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#55311c]">
        <input
          type="checkbox"
          checked={morador.receives_twilio_sms}
          onChange={(event) =>
            handleTwilioSmsToggle(morador.id, event.target.checked)
          }
          disabled={updateTwilioSmsMutation.isPending}
          className="h-4 w-4 cursor-pointer"
        />
        Receive Twilio SMS
      </label>
    )
  }

  const renderResidentIdentity = (morador?: Morador) => {
    if (!morador) return "-"

    return (
      <div className="flex flex-col">
        <span>{morador.nome}</span>
        <span className="text-xs text-[rgba(85,49,28,0.72)]">
          {morador.email || "no email"}
        </span>
      </div>
    )
  }

  const handleSearch = (term: string) => {
    setSearchTerm(term)
    setCurrentPage(0)
  }

  const handleResidentTypeFilterChange = (value: ResidentTypeFilter) => {
    setResidentTypeFilter(value)
    setCurrentPage(0)
  }

  if (isLoading && Residents.length === 0) {
    return (
      <div className="mx-auto max-w-[110rem]">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Loading residents...</p>
        </div>
      </div>
    )
  }

  if (showForm) {
    return (
      <AddResidentForm
        onBack={() => {
          setShowForm(false)
          setEditingId(null)
          setEditContext(null)
        }}
        editingId={editingId}
        editContext={editContext}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[110rem]">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Residents
          </h2>
          <button
            onClick={() => {
              setEditingId(null)
              setEditContext(null)
              setShowForm(true)
            }}
            className="flex items-center gap-2 rounded-lg bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
            type="button"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Add resident</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Resident
          </button>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              className="block text-sm font-semibold text-[#55311c] mb-2"
              htmlFor="residents-search"
            >
              Search by Name, Phone, Email or Flat
            </label>
            <input
              type="text"
              id="residents-search"
              placeholder="Digite para buscar..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full text-[#000000] rounded-lg border border-gray-300 px-3 py-2 font-['Nunito',sans-serif] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>
          <div>
            <label
              className="block text-sm font-semibold text-[#55311c] mb-2"
              htmlFor="residents-building"
            >
              Filter by building
            </label>
            <select
              id="residents-building"
              value={selectedBuilding || ""}
              onChange={(e) => handleBuildingChange(e.target.value || null)}
              className="w-full text-[#000000] rounded-lg border border-gray-300 px-3 py-2 font-['Nunito',sans-serif] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="">All buildings</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.nome}>
                  {building.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-sm font-semibold text-[#55311c] mb-2"
              htmlFor="residents-type"
            >
              Filter by type
            </label>
            <select
              id="residents-type"
              value={residentTypeFilter}
              onChange={(e) =>
                handleResidentTypeFilterChange(
                  e.target.value as ResidentTypeFilter,
                )
              }
              className="w-full text-[#000000] rounded-lg border border-gray-300 px-3 py-2 font-['Nunito',sans-serif] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="owner_1">Owner 1</option>
              <option value="owner_2">Owner 2</option>
              <option value="tenant">Tenant</option>
              <option value="agent">Agent</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {totalCount === 0 ? (
          <div className="rounded-lg bg-[#f5f1ee] p-8 text-center">
            <p className="text-[#55311c] font-['Nunito',sans-serif]">
              {searchTerm || selectedBuilding
                ? "No resident found"
                : "No resident registered"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse rounded-lg bg-white text-[13px] whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2">
                {isAllTypeView ? (
                  <>
                    <thead>
                      <tr className="bg-[#8c7569]">
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Building
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Number
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Owner 1
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone 1
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Owner 2
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone 2
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Tenant
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Agent
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedFlatRows.map((row) => (
                        <tr key={row.key} className="hover:bg-[#f5f1ee]">
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.building_nome}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {formatFlatNumber(row.flat_numero, row.flat_label)}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {renderResidentIdentity(row.owner_1)}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            <div className="flex flex-col">
                              <span>{row.owner_1?.mobile || "-"}</span>
                              {renderReadingSmsToggle(row.owner_1)}
                              {renderTwilioSmsToggle(row.owner_1)}
                            </div>
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {renderResidentIdentity(row.owner_2)}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            <div className="flex flex-col">
                              <span>{row.owner_2?.mobile || "-"}</span>
                              {renderReadingSmsToggle(row.owner_2)}
                              {renderTwilioSmsToggle(row.owner_2)}
                            </div>
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {renderResidentIdentity(row.tenant)}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            <div className="flex flex-col">
                              <span>{row.tenant?.mobile || "-"}</span>
                              {renderReadingSmsToggle(row.tenant)}
                              {renderTwilioSmsToggle(row.tenant)}
                            </div>
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {renderResidentIdentity(row.agent)}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            <div className="flex flex-col">
                              <span>{row.agent?.mobile || "-"}</span>
                              {renderReadingSmsToggle(row.agent)}
                              {renderTwilioSmsToggle(row.agent)}
                            </div>
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <button
                              onClick={() => {
                                if (row.edit_target_id === null) return
                                const targetResident =
                                  row.owner_1 ??
                                  row.owner_2 ??
                                  row.tenant ??
                                  row.agent ??
                                  null
                                setEditingId(row.edit_target_id)
                                setEditContext({
                                  editTitle: `Edit ${getResidentRoleEditToken(targetResident?.cargo ?? -1)}`,
                                  flatResidents: {
                                    owner_1: row.owner_1,
                                    owner_2: row.owner_2,
                                    tenant: row.tenant,
                                    agent: row.agent,
                                  },
                                })
                                setShowForm(true)
                              }}
                              className="mr-2 rounded-lg bg-[#8c7569] px-3 py-1 font-['Nunito',sans-serif] text-xs font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
                              type="button"
                              disabled={row.edit_target_id === null}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr className="bg-[#8c7569]">
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Building
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Number
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Name
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                          Receive readings
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                          Receive Twilio SMS
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                          Normal
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                          Gas
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedResidents.map((morador) => (
                        <tr key={morador.id} className="hover:bg-[#f5f1ee]">
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {morador.building_nome}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {formatFlatNumber(
                              morador.flat_numero,
                              morador.flat_label,
                            )}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {renderResidentIdentity(morador)}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {morador.mobile || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={morador.receives_flat_reading_sms}
                              onChange={(event) =>
                                handleReadingSmsToggle(
                                  morador.id,
                                  event.target.checked,
                                )
                              }
                              disabled={updateReadingSmsMutation.isPending}
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={morador.receives_twilio_sms}
                              onChange={(event) =>
                                handleTwilioSmsToggle(
                                  morador.id,
                                  event.target.checked,
                                )
                              }
                              disabled={updateTwilioSmsMutation.isPending}
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={(morador.reading_types & 2) !== 0}
                              onChange={() =>
                                handleCheckboxChange(
                                  morador.id,
                                  morador.reading_types,
                                  2,
                                )
                              }
                              disabled={updateReadingTypesMutation.isPending}
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={(morador.reading_types & 4) !== 0}
                              onChange={() =>
                                handleCheckboxChange(
                                  morador.id,
                                  morador.reading_types,
                                  4,
                                )
                              }
                              disabled={updateReadingTypesMutation.isPending}
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <button
                              onClick={() => {
                                setEditingId(morador.id)
                                setEditContext({
                                  editTitle: `Edit ${getResidentRoleEditToken(morador.cargo)}`,
                                })
                                setShowForm(true)
                              }}
                              className="mr-2 rounded-lg bg-[#8c7569] px-3 py-1 font-['Nunito',sans-serif] text-xs font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
                              type="button"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm font-['Nunito',sans-serif] text-[#55311c]">
                Showing {Math.min(currentPage * pageSize + 1, totalCount)} to{" "}
                {Math.min((currentPage + 1) * pageSize, totalCount)} of{" "}
                {totalCount} Residents
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  type="button"
                  className="rounded-lg bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 hover:bg-[#55311c]"
                >
                  Previous
                </button>
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => {
                    const pageNumber = i + 1
                    return (
                      <button
                        key={`page-${pageNumber}`}
                        onClick={() => setCurrentPage(i)}
                        type="button"
                        className={`rounded-lg px-3 py-2 font-['Nunito',sans-serif] text-sm font-semibold transition-all duration-200 ${
                          currentPage === i
                            ? "bg-[#55311c] text-white"
                            : "bg-gray-200 text-[#55311c] hover:bg-gray-300"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages - 1, currentPage + 1))
                  }
                  disabled={currentPage >= totalPages - 1}
                  type="button"
                  className="rounded-lg bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 hover:bg-[#55311c]"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AddResidentForm({
  onBack,
  editingId,
  editContext,
}: {
  onBack: () => void
  editingId: EntityId | null
  editContext: ResidentEditContext | null
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    mobile: "",
    cargo: 0,
    receives_flat_reading_sms: true,
    receives_twilio_sms: false,
    car1: "",
    car2: "",
    flat_id: "",
  })
  const [activeEditingId, setActiveEditingId] = useState<EntityId | null>(
    editingId,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [flats, setFlats] = useState<Array<{ id: string; label: string }>>([])
  const flatResidentsPreview = editContext?.flatResidents
  const flatResidentEntries = useMemo<FlatResidentPreviewEntry[]>(
    () =>
      [
        flatResidentsPreview?.owner_1
          ? {
              key: "owner_1",
              label: "Owner 1",
              resident: flatResidentsPreview.owner_1,
            }
          : null,
        flatResidentsPreview?.owner_2
          ? {
              key: "owner_2",
              label: "Owner 2",
              resident: flatResidentsPreview.owner_2,
            }
          : null,
        flatResidentsPreview?.tenant
          ? {
              key: "tenant",
              label: "Tenant",
              resident: flatResidentsPreview.tenant,
            }
          : null,
        flatResidentsPreview?.agent
          ? {
              key: "agent",
              label: "Agent",
              resident: flatResidentsPreview.agent,
            }
          : null,
      ].filter((entry): entry is FlatResidentPreviewEntry => entry !== null),
    [flatResidentsPreview],
  )
  const hasFlatResidentsPreview = Boolean(
    flatResidentsPreview?.owner_1 ||
      flatResidentsPreview?.owner_2 ||
      flatResidentsPreview?.tenant ||
      flatResidentsPreview?.agent,
  )
  const activePreviewResident =
    flatResidentEntries.find(
      (entry) => String(entry.resident.id) === String(activeEditingId),
    )?.resident ?? null
  const shouldShowCarFields = activeEditingId
    ? activePreviewResident?.cargo === 0
    : Number(formData.cargo) === 0
  const activeEditTitle = activePreviewResident
    ? `Edit ${getResidentRoleEditToken(activePreviewResident.cargo)}`
    : (editContext?.editTitle ?? "Edit resident")

  useEffect(() => {
    setActiveEditingId(editingId)
  }, [editingId])

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  // Load editing morador data if editingId is set
  useEffect(() => {
    if (activeEditingId) {
      const loadMorador = async () => {
        try {
          const response = await fetch(
            `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/moradores/${activeEditingId}`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("access_token")}`,
              },
            },
          )
          const morador = (await response.json()) as MoradorDetail
          setFormData({
            nome: morador.nome,
            email: morador.email || "",
            mobile: morador.mobile?.toString() || "",
            cargo: morador.cargo,
            receives_flat_reading_sms: morador.receives_flat_reading_sms,
            receives_twilio_sms: morador.receives_twilio_sms,
            car1: morador.car1 || "",
            car2: morador.car2 || "",
            flat_id: String(morador.flat_id),
          })
        } catch (error) {
          console.error("Error loading resident:", error)
        }
      }
      loadMorador()
    }
  }, [activeEditingId])

  // Build flats list from buildings
  useEffect(() => {
    const allFlats: Array<{ id: string; label: string }> = []

    // Sort buildings by nome and flats by numero
    const sortedBuildings = [...(buildingsData?.data || [])].sort((a, b) =>
      a.nome.localeCompare(b.nome),
    )

    sortedBuildings.forEach((building) => {
      const sortedFlats = [...(building.flats || [])].sort(
        (a, b) => a.numero - b.numero,
      )

      sortedFlats.forEach((flat) => {
        allFlats.push({
          id: String(flat.id),
          label: `${building.nome} - ${formatFlatLabel(
            flat.numero,
            flat.label,
          )}`,
        })
      })
    })
    setFlats(allFlats)
  }, [buildingsData])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    const nextValue =
      e.target instanceof HTMLInputElement && e.target.type === "checkbox"
        ? e.target.checked
        : value
    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = activeEditingId
        ? `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/moradores/${activeEditingId}`
        : `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/moradores/`

      const method = activeEditingId ? "PATCH" : "POST"

      const payload = {
        nome: formData.nome,
        email: formData.email || null,
        mobile: formData.mobile || "",
        receives_flat_reading_sms: formData.receives_flat_reading_sms,
        receives_twilio_sms: formData.receives_twilio_sms,
        ...(!activeEditingId ? { cargo: formData.cargo } : {}),
        ...(shouldShowCarFields
          ? {
              car1: formData.car1 || null,
              car2: formData.car2 || null,
            }
          : {}),
        flat_id: formData.flat_id,
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error("Failed to save resident")
      }

      showSuccessToast(
        activeEditingId
          ? "Resident updated successfully!"
          : "Resident created successfully!",
      )
      await queryClient.invalidateQueries({ queryKey: ["Residents"] })
      await queryClient.invalidateQueries({ queryKey: ["buildings"] })
      onBack()
    } catch (error) {
      console.error("Error submitting form:", error)
      showErrorToast("Error saving resident")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            {activeEditingId ? activeEditTitle : "New Resident"}
          </h2>
          <button
            onClick={onBack}
            className="rounded-lg bg-gray-500 px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-gray-600"
            type="button"
          >
            Back
          </button>
        </div>

        {activeEditingId && hasFlatResidentsPreview && (
          <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#f9f7f5] p-4">
            <h3 className="text-sm font-semibold text-[#55311c]">
              Residents in this flat
            </h3>
            <p className="mt-1 text-xs text-[rgba(85,49,28,0.75)]">
              Select which resident from this flat you want to edit.
            </p>
            <div className="mt-3 grid gap-2 text-sm text-[#55311c] sm:grid-cols-2">
              {flatResidentEntries.map((entry) => {
                const isActive =
                  String(entry.resident.id) === String(activeEditingId)
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setActiveEditingId(entry.resident.id)}
                    className={`rounded-lg border px-3 py-2 text-left transition-all duration-200 ${
                      isActive
                        ? "border-[#55311c] bg-[#55311c] text-white"
                        : "border-[#d9d0ca] bg-white text-[#55311c] hover:bg-[#f0ebe7]"
                    }`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      {entry.label}
                    </div>
                    <div className="font-semibold">{entry.resident.nome}</div>
                    <div className="text-xs opacity-80">
                      {entry.resident.mobile || "No phone"}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-nome"
              >
                Name *
              </label>
              <input
                type="text"
                id="resident-nome"
                name="nome"
                value={formData.nome}
                onChange={handleInputChange}
                required
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Resident name"
              />
            </div>

            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-email"
              >
                Email
              </label>
              <input
                type="email"
                id="resident-email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-mobile"
              >
                Phone
              </label>
              <input
                type="tel"
                id="resident-mobile"
                name="mobile"
                value={formData.mobile}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Phone number"
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border-2 border-[#ddd] bg-[#faf8f6] px-4 py-3 md:col-span-2">
              <input
                type="checkbox"
                id="resident-receives-flat-reading-sms"
                name="receives_flat_reading_sms"
                checked={formData.receives_flat_reading_sms}
                onChange={handleInputChange}
                className="h-4 w-4 cursor-pointer"
              />
              <label
                className="font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-receives-flat-reading-sms"
              >
                Receive flat reading SMS
              </label>
            </div>

            <div className="flex items-center gap-3 rounded-lg border-2 border-[#ddd] bg-[#faf8f6] px-4 py-3 md:col-span-2">
              <input
                type="checkbox"
                id="resident-receives-twilio-sms"
                name="receives_twilio_sms"
                checked={formData.receives_twilio_sms}
                onChange={handleInputChange}
                className="h-4 w-4 cursor-pointer"
              />
              <label
                className="font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-receives-twilio-sms"
              >
                Receive Twilio SMS
              </label>
            </div>

            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-flat"
              >
                Flat *
              </label>
              <select
                id="resident-flat"
                name="flat_id"
                value={formData.flat_id}
                onChange={handleInputChange}
                required
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
              >
                <option value="">Select a flat</option>
                {flats.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.label}
                  </option>
                ))}
              </select>
            </div>

            {shouldShowCarFields && (
              <>
                <div>
                  <label
                    className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                    htmlFor="resident-car1"
                  >
                    Car 1
                  </label>
                  <input
                    type="text"
                    id="resident-car1"
                    name="car1"
                    value={formData.car1}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                    placeholder="Car registration"
                  />
                </div>

                <div>
                  <label
                    className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                    htmlFor="resident-car2"
                  >
                    Car 2
                  </label>
                  <input
                    type="text"
                    id="resident-car2"
                    name="car2"
                    value={formData.car2}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                    placeholder="Car registration"
                  />
                </div>
              </>
            )}

            {!activeEditingId && (
              <div>
                <label
                  className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                  htmlFor="resident-cargo"
                >
                  Role
                </label>
                <select
                  id="resident-cargo"
                  name="cargo"
                  value={formData.cargo}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                >
                  <option value="0">Resident</option>
                  <option value="1">Owner</option>
                  <option value="2">Tenant</option>
                </select>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-gray-500 px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#8c7569] px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving..."
                : activeEditingId
                  ? "Update Resident"
                  : "Create Resident"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
