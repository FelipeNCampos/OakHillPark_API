import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { CheckIcon } from "lucide-react"
import QRCode from "qrcode"
import type { ChangeEvent, KeyboardEvent } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

interface CaretakerMonthlyGoalRecord {
  id: EntityId
  month_start: string
  target_hours: number
  condominio_id: EntityId
  created_at: string
  updated_at: string
}

interface CaretakerMonthlyMetricRecord {
  month_start: string
  worked_hours: number
  target_hours: number
  carry_over_hours: number
  effective_target_hours: number
  remaining_hours: number
}

interface WorkerInvoiceHourEntry {
  id: string
  monthKey: string
  hours: number
  workerName: string
  createdAt: string
  fileName: string
}

interface CashFlowRecord {
  id: EntityId
  payment_number: number
  has_invoice: boolean
  invoice_media_name?: string | null
  invoice_media_data?: string | null
  record_date: string
  amount: number
  description: string
  created_at: string
}

interface CashFlowRecordsResponse {
  data: CashFlowRecord[]
  count: number
  balance: number
  next_payment_number: number
}

interface CashFlowFormState {
  hasInvoice: boolean
  invoiceMediaName: string
  invoiceMediaData: string | null
  recordDate: string
  amount: string
  description: string
}

interface CaretakerRecordEditState {
  recordId: EntityId
  originalIso: string
  label: "Time IN" | "Time OUT"
  recordType: "work-time" | "bins"
  rowKey?: string
  buildingLabel?: string
  dateValue?: string | null
  inRecordId?: EntityId | null
  inOriginalIso?: string | null
  outRecordId?: EntityId | null
  outOriginalIso?: string | null
}

interface CaretakerManualActionState {
  mode: "checkin" | "checkout"
  recordType: "work-time" | "bins"
  buildingId: EntityId | null
  buildingLabel: string
  referenceIso: string
}

interface CleanerRecordEditState {
  inRecordId: EntityId | null
  inOriginalIso: string | null
  outRecordId: EntityId | null
  outOriginalIso: string | null
}

interface CleanerManualActionState {
  mode: "checkin" | "checkout"
  buildingId: EntityId
  buildingLabel: string
  referenceIso: string
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
  extra_media_2_name?: string | null
  extra_media_2_data?: string | null
  extra_media_3_name?: string | null
  extra_media_3_data?: string | null
  extra_media_4_name?: string | null
  extra_media_4_data?: string | null
  in_at: string
  out_at?: string | null
  condominio_id: EntityId
}

interface ContractorMediaSlotState {
  name: string
  data: string | null
}

interface ContractorMediaFormState {
  slots: ContractorMediaSlotState[]
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
  building_id?: EntityId | null
  building_name?: string | null
  certificate_date: string
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
  buildingId: string
  certificateDate: string
  media1Name: string
  media1Data: string | null
  media2Name: string
  media2Data: string | null
}

interface FireAlarmCallPointListState {
  buildingId: FireAlarmBuildingId
  buildingLabel: string
  currentCallPoint: string
  currentLocation: string
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
  car1?: string | null
  car2?: string | null
  car3?: string | null
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
const FIRE_ALARM_DELETED_DATES_STORAGE_KEY =
  "ohp_fire_alarm_schedule_deleted_dates_v1"
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
      "024",
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
      "Garage Front Door",
      "Garage Back Door",
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

const readDateSetFromStorage = (storageKey: string) => {
  if (typeof window === "undefined") return new Set<string>()

  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return new Set<string>()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()

    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    )
  } catch {
    return new Set<string>()
  }
}

const writeDateSetToStorage = (storageKey: string, dates: Iterable<string>) => {
  if (typeof window === "undefined") return

  localStorage.setItem(storageKey, JSON.stringify([...new Set(dates)].sort()))
}

const formatDateToGb = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-")
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}

const formatCurrencyGbp = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value)

const padDatePart = (value: number) => String(value).padStart(2, "0")

const getTodayDateInputValue = () => {
  const now = new Date()
  return `${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}-${padDatePart(now.getDate())}`
}

const getCurrentMonthInputValue = () => {
  const now = new Date()
  return `${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}`
}

const getMonthDateRange = (monthValue: string) => {
  const [year, month] = monthValue.split("-")
  const lastDay = new Date(Number(year), Number(month), 0).getDate()
  return {
    dateFrom: `${year}-${month}-01`,
    dateTo: `${year}-${month}-${padDatePart(lastDay)}`,
  }
}

const buildMonthRangeLabel = (monthFrom: string, monthTo: string) => {
  const formatMonth = (monthValue: string) => {
    const [yearRaw, monthRaw] = monthValue.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (!year || !month) return monthValue
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  }

  return monthFrom === monthTo
    ? formatMonth(monthFrom)
    : `${formatMonth(monthFrom)} to ${formatMonth(monthTo)}`
}

const getEmptyCashFlowForm = (): CashFlowFormState => ({
  hasInvoice: false,
  invoiceMediaName: "",
  invoiceMediaData: null,
  recordDate: getTodayDateInputValue(),
  amount: "",
  description: "",
})

const CARETAKER_INVOICE_HOURS_STORAGE_KEY = "oakhill-caretaker-invoice-hours"
const CLEANER_INVOICE_HOURS_STORAGE_KEY = "oakhill-cleaner-invoice-hours"
const CONTRACTOR_INVOICE_HOURS_STORAGE_KEY = "oakhill-contractor-invoice-hours"

const readInvoiceHoursFromStorage = (
  storageKey: string,
): WorkerInvoiceHourEntry[] => {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => ({
        id: String(entry?.id || ""),
        monthKey: String(entry?.monthKey || ""),
        hours: Number(entry?.hours),
        workerName: String(
          entry?.workerName || entry?.caretakerName || "Worker",
        ),
        createdAt: String(entry?.createdAt || ""),
        fileName: String(entry?.fileName || ""),
      }))
      .filter(
        (entry) =>
          entry.id &&
          /^\d{4}-\d{2}$/.test(entry.monthKey) &&
          Number.isFinite(entry.hours) &&
          entry.hours > 0,
      )
  } catch {
    return []
  }
}

const writeInvoiceHoursToStorage = (
  storageKey: string,
  entries: WorkerInvoiceHourEntry[],
) => {
  if (typeof window === "undefined") return
  localStorage.setItem(storageKey, JSON.stringify(entries))
}

const formatInvoiceHours = (hours: number) => {
  if (!Number.isFinite(hours)) return "0h"
  const rounded = Number(hours.toFixed(2))
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`
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

const CONTRACTOR_MEDIA_SLOT_COUNT = 4

const createEmptyContractorMediaSlot = (): ContractorMediaSlotState => ({
  name: "",
  data: null,
})

const getEmptyContractorMediaForm = (): ContractorMediaFormState => ({
  slots: Array.from({ length: CONTRACTOR_MEDIA_SLOT_COUNT }, () =>
    createEmptyContractorMediaSlot(),
  ),
})

const getContractorVisitMediaSlots = (
  visit: ContractorVisitAdmin,
): ContractorMediaSlotState[] => [
  {
    name: visit.extra_media_name || "",
    data: visit.extra_media_data || null,
  },
  {
    name: visit.extra_media_2_name || "",
    data: visit.extra_media_2_data || null,
  },
  {
    name: visit.extra_media_3_name || "",
    data: visit.extra_media_3_data || null,
  },
  {
    name: visit.extra_media_4_name || "",
    data: visit.extra_media_4_data || null,
  },
]

const buildContractorMediaPayload = (
  mediaForm: ContractorMediaFormState,
): Record<string, string | null> => {
  const payload: Record<string, string | null> = {}

  mediaForm.slots.forEach((slot, index) => {
    const slotSuffix = index === 0 ? "" : `_${index + 1}`
    const fallbackName = `contractor-media-${index + 1}`

    payload[`extra_media${slotSuffix}_name`] = slot.data
      ? slot.name.trim() || fallbackName
      : null
    payload[`extra_media${slotSuffix}_data`] = slot.data || null
  })

  return payload
}

const getEmptyFireAlarmExternalCertificateForm =
  (): FireAlarmExternalCertificateFormState => ({
    buildingId: "",
    certificateDate: toDateInputValue(),
    media1Name: "",
    media1Data: null,
    media2Name: "",
    media2Data: null,
  })

const getFireAlarmExternalCertificateFormFromRecord = (
  certificate: FireAlarmExternalCertificate,
): FireAlarmExternalCertificateFormState => ({
  buildingId: certificate.building_id ? String(certificate.building_id) : "",
  certificateDate: certificate.certificate_date || toDateInputValue(),
  media1Name: certificate.media_1_name || "",
  media1Data: certificate.media_1_data || null,
  media2Name: certificate.media_2_name || "",
  media2Data: certificate.media_2_data || null,
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

const getFireAlarmBuildingConfig = (buildingId: FireAlarmBuildingId) =>
  FIRE_ALARM_BUILDINGS.find((building) => building.id === buildingId) || null

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
    { label: "Cash Flow", id: "cash-flow" },
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
      case "cash-flow":
        return <CashFlowContent />
      case "twillio":
        return <TwilioContent />
      default:
        return <OverviewContent user={user} onNavigate={setActiveTab} />
    }
  }

  return (
    <div className="dashboard-mobile-root flex min-h-screen w-full bg-[#f5f1ee]">
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
      <div className="flex min-w-0 flex-1 flex-col">
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
        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-8">
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
  const groupedShortcuts = [
    {
      title: "Readings",
      items: [
        { label: "Buildings", tabId: "buildings" },
        { label: "Flats", tabId: "flats" },
      ],
    },
    {
      title: "QR Codes",
      items: [
        { label: "Cleaner", tabId: "qr-cleaner" },
        { label: "Contractor", tabId: "qr-contractor" },
        { label: "Caretaker", tabId: "qr-caretaker" },
        { label: "Bin Report", tabId: "qr-bins" },
      ],
    },
    {
      title: "Schedules",
      items: [
        { label: "Alarm schedule", tabId: "schedule-alarm" },
        { label: "Lift schedule", tabId: "schedule-lift" },
        { label: "Emergency light", tabId: "schedule-light" },
      ],
    },
  ]

  const standaloneShortcuts = [
    { label: "Tasks", tabId: "tasks" },
    { label: "Reminders", tabId: "reminds" },
    { label: "Residents", tabId: "residents" },
    { label: "Contractors", tabId: "contractors" },
    { label: "History", tabId: "history" },
    { label: "Cleaner", tabId: "cleaner" },
    { label: "Caretaker", tabId: "caretaker" },
    { label: "Bins", tabId: "bins" },
    { label: "Cash Flow", tabId: "cash-flow" },
    { label: "Twilio", tabId: "twillio" },
  ]

  return (
    <div className="mx-auto max-w-7xl">
      {/* Welcome Section */}
      <div className="mb-8 rounded-lg bg-white p-8 shadow-md">
        <h2 className="mb-2 font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          Welcome, {user?.full_name || "Manager"}!
        </h2>
      </div>

      <div className="rounded-2xl border border-[#e5e0dc] bg-white p-5 shadow-md sm:p-6">
        <div className="mb-5 flex flex-col gap-1">
          <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
            Shortcuts
          </h3>
          <p className="text-sm text-[rgba(0,0,0,0.65)]">
            Jump directly to the dashboard sections.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {groupedShortcuts.map((group) => (
            <section
              key={group.title}
              className="rounded-xl border border-[#eadfd8] bg-[#faf8f6] p-4"
            >
              <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-[rgba(85,49,28,0.72)]">
                {group.title}
              </h4>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <button
                    key={item.tabId}
                    type="button"
                    onClick={() => onNavigate(item.tabId)}
                    className="rounded-full border border-[#d9d0ca] bg-white px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8c7569] hover:bg-[#f0ebe7]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-5 border-t border-[#eee7e2] pt-5">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-[rgba(85,49,28,0.72)]">
            Menu
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {standaloneShortcuts.map((item) => (
              <button
                key={item.tabId}
                type="button"
                onClick={() => onNavigate(item.tabId)}
                className="w-full rounded-full border border-[#d9d0ca] bg-white px-3 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8c7569] hover:bg-[#f0ebe7]"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CashFlowContent() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthInputValue)
  const [search, setSearch] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [invoicePreview, setInvoicePreview] = useState<CashFlowRecord | null>(
    null,
  )
  const [invoiceUploadRecord, setInvoiceUploadRecord] =
    useState<CashFlowRecord | null>(null)
  const [invoiceUploadMediaName, setInvoiceUploadMediaName] = useState("")
  const [invoiceUploadMediaData, setInvoiceUploadMediaData] = useState<
    string | null
  >(null)
  const [editingDescriptionRecord, setEditingDescriptionRecord] =
    useState<CashFlowRecord | null>(null)
  const [editingDescriptionValue, setEditingDescriptionValue] = useState("")
  const [form, setForm] = useState<CashFlowFormState>(getEmptyCashFlowForm)
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [reportMonthFrom, setReportMonthFrom] = useState(
    getCurrentMonthInputValue,
  )
  const [reportMonthTo, setReportMonthTo] = useState(getCurrentMonthInputValue)
  const [reportEmail, setReportEmail] = useState("")
  const [reportPdfDataUrl, setReportPdfDataUrl] = useState("")
  const [reportPdfPreviewUrl, setReportPdfPreviewUrl] = useState("")
  const [reportFileName, setReportFileName] = useState("")
  const [reportInvoiceCount, setReportInvoiceCount] = useState(0)
  const [includeInvoiceReportTable, setIncludeInvoiceReportTable] =
    useState(false)
  const [isGeneratingInvoiceReport, setIsGeneratingInvoiceReport] =
    useState(false)
  const [isSendingInvoiceReport, setIsSendingInvoiceReport] = useState(false)
  const { dateFrom, dateTo } = useMemo(
    () => getMonthDateRange(selectedMonth),
    [selectedMonth],
  )
  const deferredSearch = useDeferredValue(search.trim())

  useEffect(() => {
    if (!reportPdfPreviewUrl) return undefined
    return () => URL.revokeObjectURL(reportPdfPreviewUrl)
  }, [reportPdfPreviewUrl])

  const recordsQuery = useQuery<CashFlowRecordsResponse>({
    queryKey: ["cash-flow", selectedMonth, deferredSearch],
    queryFn: () =>
      apiCall("/api/v1/cash-flow/", {
        skip: 0,
        limit: 500,
        date_from: dateFrom,
        date_to: dateTo,
        search: deferredSearch || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const monthSummaryQuery = useQuery<CashFlowRecordsResponse>({
    queryKey: ["cash-flow", selectedMonth, "summary"],
    queryFn: () =>
      apiCall("/api/v1/cash-flow/", {
        skip: 0,
        limit: 1,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    placeholderData: keepPreviousData,
  })

  const records = recordsQuery.data?.data || []
  const monthBalance = monthSummaryQuery.data?.balance || 0

  const recordsWithBalance = useMemo(() => {
    let runningBalance = 0
    return records.map((record) => {
      runningBalance += Number(record.amount)
      return { ...record, balance: runningBalance }
    })
  }, [records])

  const createCashFlowMutation = useMutation({
    mutationFn: (payload: {
      has_invoice: boolean
      invoice_media_name?: string | null
      invoice_media_data?: string | null
      record_date: string
      amount: number
      description: string
    }) =>
      apiCall("/api/v1/cash-flow/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Cash flow record saved")
      setIsDialogOpen(false)
      setForm(getEmptyCashFlowForm())
      queryClient.invalidateQueries({ queryKey: ["cash-flow"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Could not save record",
      )
    },
  })

  const deleteCashFlowMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/cash-flow/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      showSuccessToast("Cash flow record deleted")
      queryClient.invalidateQueries({ queryKey: ["cash-flow"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Could not delete record",
      )
    },
  })

  const updateCashFlowMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: EntityId
      payload: Record<string, unknown>
    }) =>
      apiCall(`/api/v1/cash-flow/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-flow"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Could not update record",
      )
    },
  })

  const updateForm = <K extends keyof CashFlowFormState>(
    key: K,
    value: CashFlowFormState[K],
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open) {
      setForm(getEmptyCashFlowForm())
    }
  }

  const resetInvoiceReportPreview = () => {
    setReportPdfDataUrl("")
    setReportPdfPreviewUrl("")
    setReportFileName("")
    setReportInvoiceCount(0)
  }

  const handleReportDialogChange = (open: boolean) => {
    setIsReportDialogOpen(open)
    if (!open) {
      resetInvoiceReportPreview()
    }
  }

  const handleInvoiceFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setForm((previous) => ({
        ...previous,
        invoiceMediaName: file.name,
        invoiceMediaData: dataUrl,
      }))
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not read invoice media",
      )
    } finally {
      event.target.value = ""
    }
  }

  const resetInvoiceUploadDialog = () => {
    setInvoiceUploadRecord(null)
    setInvoiceUploadMediaName("")
    setInvoiceUploadMediaData(null)
  }

  const handleExistingInvoiceFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setInvoiceUploadMediaName(file.name)
      setInvoiceUploadMediaData(dataUrl)
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not read invoice media",
      )
    } finally {
      event.target.value = ""
    }
  }

  const handleSaveExistingInvoice = async () => {
    if (!invoiceUploadRecord) return
    if (!invoiceUploadMediaData) {
      showErrorToast("Select invoice media")
      return
    }

    try {
      await updateCashFlowMutation.mutateAsync({
        id: invoiceUploadRecord.id,
        payload: {
          has_invoice: true,
          invoice_media_name: invoiceUploadMediaName || null,
          invoice_media_data: invoiceUploadMediaData,
        },
      })
      showSuccessToast("Invoice media added")
      resetInvoiceUploadDialog()
    } catch {
      // The mutation already shows the error toast.
    }
  }

  const handleOpenDescriptionEdit = (record: CashFlowRecord) => {
    setEditingDescriptionRecord(record)
    setEditingDescriptionValue(record.description || "")
  }

  const resetDescriptionEditDialog = () => {
    setEditingDescriptionRecord(null)
    setEditingDescriptionValue("")
  }

  const handleSaveDescriptionEdit = async () => {
    if (!editingDescriptionRecord) return

    try {
      await updateCashFlowMutation.mutateAsync({
        id: editingDescriptionRecord.id,
        payload: {
          description: editingDescriptionValue.trim(),
        },
      })
      showSuccessToast("Description updated")
      resetDescriptionEditDialog()
    } catch {
      // The mutation already shows the error toast.
    }
  }

  const handleSubmit = () => {
    const rawAmount = Number(form.amount)
    if (!form.recordDate) {
      showErrorToast("Date is required")
      return
    }
    if (!form.amount.trim() || !Number.isFinite(rawAmount)) {
      showErrorToast("Amount must be a valid number")
      return
    }
    if (rawAmount === 0) {
      showErrorToast("Amount must be different from zero")
      return
    }

    createCashFlowMutation.mutate({
      has_invoice: form.hasInvoice,
      invoice_media_name: form.hasInvoice ? form.invoiceMediaName || null : null,
      invoice_media_data: form.hasInvoice ? form.invoiceMediaData : null,
      record_date: form.recordDate,
      amount: rawAmount,
      description: form.description.trim(),
    })
  }

  const handleDelete = (record: CashFlowRecord) => {
    if (deleteCashFlowMutation.isPending) return

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete payment #${record.payment_number} from ${formatDateToGb(record.record_date)}?`,
          )
    if (!confirmed) return
    deleteCashFlowMutation.mutate(record.id)
  }

  const generateInvoiceReportPdf = async () => {
    if (!reportMonthFrom || !reportMonthTo) {
      showErrorToast("Select the month range")
      return null
    }
    if (reportMonthFrom > reportMonthTo) {
      showErrorToast("Start month must be before end month")
      return null
    }

    const rangeFrom = getMonthDateRange(reportMonthFrom)
    const rangeTo = getMonthDateRange(reportMonthTo)
    const periodLabel = buildMonthRangeLabel(reportMonthFrom, reportMonthTo)

    setIsGeneratingInvoiceReport(true)
    try {
      const pageLimit = 500
      const firstPage = (await apiCall("/api/v1/cash-flow/", {
        skip: 0,
        limit: pageLimit,
        date_from: rangeFrom.dateFrom,
        date_to: rangeTo.dateTo,
      })) as CashFlowRecordsResponse
      const allRecords = [...(firstPage.data || [])]
      for (let skip = pageLimit; skip < (firstPage.count || 0); skip += pageLimit) {
        const nextPage = (await apiCall("/api/v1/cash-flow/", {
          skip,
          limit: pageLimit,
          date_from: rangeFrom.dateFrom,
          date_to: rangeTo.dateTo,
        })) as CashFlowRecordsResponse
        allRecords.push(...(nextPage.data || []))
      }

      const invoiceRecords = allRecords.filter(
        (record) => record.has_invoice && record.invoice_media_data,
      )

      if (invoiceRecords.length === 0) {
        showErrorToast("No invoices found in the selected range")
        resetInvoiceReportPreview()
        return null
      }

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 40

      const renderInvoiceTable = (
        records: CashFlowRecord[],
        tablePeriodLabel: string,
      ) => {
        doc.setFontSize(16)
        doc.text("Cash Flow Invoice Report", margin, 42)
        doc.setFontSize(10)
        doc.text(`Period: ${tablePeriodLabel}`, margin, 62)
        doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, margin, 78)

        autoTable(doc, {
          startY: 98,
          head: [["Payment #", "Date", "Amount", "Description", "Invoice"]],
          body: records.map((record) => [
            record.payment_number,
            formatDateToGb(record.record_date),
            formatCurrencyGbp(record.amount),
            record.description || "-",
            record.invoice_media_name || "Invoice",
          ]),
          theme: "grid",
          styles: {
            fontSize: 8,
            cellPadding: 4,
            lineColor: [180, 180, 180],
            lineWidth: 0.4,
          },
          headStyles: {
            fillColor: [140, 117, 105],
            textColor: 255,
            fontStyle: "bold",
          },
        })
      }

      const renderInvoiceMediaPage = async (
        record: CashFlowRecord,
        monthLabel?: string,
      ) => {
        doc.setFontSize(13)
        doc.text(`Invoice #${record.payment_number}`, margin, 38)
        doc.setFontSize(9)
        doc.text(`Date: ${formatDateToGb(record.record_date)}`, margin, 56)
        doc.text(`Amount: ${formatCurrencyGbp(record.amount)}`, margin, 72)
        doc.text(`Description: ${record.description || "-"}`, margin, 88, {
          maxWidth: pageWidth - margin * 2,
        })
        if (monthLabel) {
          doc.text(`Month: ${monthLabel}`, margin, 108)
        }
        const mediaData = record.invoice_media_data || ""
        if (isImageDataUrl(mediaData)) {
          try {
            const image = new Image()
            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve()
              image.onerror = () => reject(new Error("Could not load invoice image"))
              image.src = mediaData
            })
            const maxWidth = pageWidth - margin * 2
            const maxHeight = pageHeight - 180
            const ratio = Math.min(
              maxWidth / Math.max(image.naturalWidth, 1),
              maxHeight / Math.max(image.naturalHeight, 1),
            )
            const width = image.naturalWidth * ratio
            const height = image.naturalHeight * ratio
            const x = margin + (maxWidth - width) / 2
            const y = 130 + (maxHeight - height) / 2
            const canvasRatio = Math.min(
              1,
              1400 / Math.max(image.naturalWidth, 1),
              1800 / Math.max(image.naturalHeight, 1),
            )
            const canvas = document.createElement("canvas")
            canvas.width = Math.max(1, Math.round(image.naturalWidth * canvasRatio))
            canvas.height = Math.max(1, Math.round(image.naturalHeight * canvasRatio))
            const context = canvas.getContext("2d")
            if (!context) throw new Error("Could not prepare invoice image")
            context.fillStyle = "#ffffff"
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            const compressedImage = canvas.toDataURL("image/jpeg", 0.78)
            doc.addImage(compressedImage, "JPEG", x, y, width, height)
          } catch {
            doc.setFontSize(11)
            doc.text("Invoice image could not be added to the PDF.", margin, 150)
          }
        } else if (isPdfDataUrl(mediaData)) {
          doc.setFontSize(11)
          doc.text(
            "This invoice was uploaded as a PDF. Its file is listed in this report, but PDF pages cannot be merged in the browser preview.",
            margin,
            150,
            { maxWidth: pageWidth - margin * 2 },
          )
        } else {
          doc.setFontSize(11)
          doc.text("Invoice preview is not available for this file type.", margin, 150)
        }
      }

      if (includeInvoiceReportTable) {
        const recordsByMonth = new Map<string, CashFlowRecord[]>()
        for (const record of invoiceRecords) {
          const monthKey = record.record_date.slice(0, 7)
          recordsByMonth.set(monthKey, [
            ...(recordsByMonth.get(monthKey) || []),
            record,
          ])
        }

        for (const [groupIndex, [monthKey, records]] of Array.from(
          recordsByMonth.entries(),
        ).entries()) {
          const monthLabel =
            reportMonthFrom === reportMonthTo
              ? periodLabel
              : buildMonthRangeLabel(monthKey, monthKey)
          if (groupIndex > 0) {
            doc.addPage()
          }
          renderInvoiceTable(records, monthLabel)
          for (const record of records) {
            doc.addPage()
            await renderInvoiceMediaPage(record, monthLabel)
          }
        }
      } else {
        for (const [index, record] of invoiceRecords.entries()) {
          if (index > 0) {
            doc.addPage()
          }
          await renderInvoiceMediaPage(record)
        }
      }

      const pdfBlob = doc.output("blob")
      const dataUrl = doc.output("datauristring")
      const fileName = `cash-flow-invoices-${reportMonthFrom}-to-${reportMonthTo}.pdf`
      setReportPdfDataUrl(dataUrl)
      setReportPdfPreviewUrl(URL.createObjectURL(pdfBlob))
      setReportFileName(fileName)
      setReportInvoiceCount(invoiceRecords.length)
      return { dataUrl, fileName, invoiceCount: invoiceRecords.length, periodLabel }
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Failed to generate invoice report",
      )
      return null
    } finally {
      setIsGeneratingInvoiceReport(false)
    }
  }

  const handleSendInvoiceReport = async () => {
    if (!reportEmail.trim()) {
      showErrorToast("Email is required")
      return
    }

    const report =
      reportPdfDataUrl && reportFileName
        ? {
            dataUrl: reportPdfDataUrl,
            fileName: reportFileName,
            invoiceCount: reportInvoiceCount,
            periodLabel: buildMonthRangeLabel(reportMonthFrom, reportMonthTo),
          }
        : await generateInvoiceReportPdf()
    if (!report) return

    const fileDataBase64 = report.dataUrl.split(",")[1] || ""
    if (!fileDataBase64) {
      showErrorToast("Failed to prepare report file")
      return
    }

    try {
      setIsSendingInvoiceReport(true)
      await apiCall("/api/v1/utils/send-report-email/", {
        method: "POST",
        body: {
          email_to: reportEmail.trim(),
          subject: "Cash Flow Invoice Report",
          html_content: `<p>Hello,</p><p>Please find attached the cash flow invoice report for ${report.periodLabel}.</p><p>Invoices included: ${report.invoiceCount}</p>`,
          file_name: report.fileName,
          file_data_base64: fileDataBase64,
        },
      })
      showSuccessToast("Invoice report sent successfully")
      handleReportDialogChange(false)
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Failed to send invoice report",
      )
    } finally {
      setIsSendingInvoiceReport(false)
    }
  }

  useEffect(() => {
    if (!isReportDialogOpen) return
    if (!reportMonthFrom || !reportMonthTo) return
    if (reportMonthFrom > reportMonthTo) return

    const timeoutId = window.setTimeout(() => {
      generateInvoiceReportPdf()
    }, 200)

    return () => window.clearTimeout(timeoutId)
  }, [isReportDialogOpen, reportMonthFrom, reportMonthTo, includeInvoiceReportTable])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Cash Flow Control
            </h2>
            <p className="mt-1 text-[rgba(0,0,0,0.7)]">
              Monthly register for payments, invoices and descriptions.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <button
              type="button"
              onClick={() => setIsReportDialogOpen(true)}
              className="rounded-lg border border-[#8c7569] px-4 py-3 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Invoice report
            </button>
            <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[rgba(85,49,28,0.7)]">
                Month balance
              </p>
              <p
                className={`mt-1 font-mono text-2xl font-bold ${
                  monthBalance < 0 ? "text-[#b42318]" : "text-[#217a4b]"
                }`}
              >
                {formatCurrencyGbp(monthBalance)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="grid gap-3 lg:grid-cols-[170px_minmax(220px,1fr)_auto] lg:items-end">
          <div>
            <label
              htmlFor="cash-flow-month"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Month
            </label>
            <input
              id="cash-flow-month"
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>
          <div>
            <label
              htmlFor="cash-flow-search"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Search
            </label>
            <input
              id="cash-flow-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Description"
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
          >
            New record
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="bg-[#bdb7b2]">
                <th className="border border-[#7e6a5f] px-3 py-2 text-center text-sm font-bold text-[#333]">
                  Payment Number
                </th>
                <th className="border border-[#7e6a5f] px-3 py-2 text-center text-sm font-bold text-[#333]">
                  Invoice
                </th>
                <th className="border border-[#7e6a5f] px-3 py-2 text-center text-sm font-bold text-[#333]">
                  Date
                </th>
                <th className="border border-[#7e6a5f] px-3 py-2 text-right text-sm font-bold text-[#333]">
                  Amount
                </th>
                <th className="border border-[#7e6a5f] px-3 py-2 text-center text-sm font-bold text-[#333]">
                  Description
                </th>
                <th className="border border-[#7e6a5f] px-3 py-2 text-right text-sm font-bold text-[#333]">
                  Balance
                </th>
                <th className="border border-[#7e6a5f] px-3 py-2 text-center text-sm font-bold text-[#333]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {recordsQuery.isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    className="border border-[#e5e0dc] px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    Loading cash flow records...
                  </td>
                </tr>
              )}
              {!recordsQuery.isLoading && records.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="border border-[#e5e0dc] px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    No cash flow records found for this month.
                  </td>
                </tr>
              )}
              {!recordsQuery.isLoading &&
                recordsWithBalance.map((record) => (
                  <tr key={record.id} className="bg-white hover:bg-[#f8f5f3]">
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center font-mono text-sm text-[#55311c]">
                      {record.payment_number}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm text-[#55311c]">
                      {record.has_invoice ? (
                        record.invoice_media_data ? (
                          <button
                            type="button"
                            onClick={() => setInvoicePreview(record)}
                            aria-label="Open invoice preview"
                            className="inline-flex items-center justify-center rounded border border-black bg-white p-1 text-black transition-all duration-200 hover:bg-[#f0f0f0] focus:outline-none focus:ring-2 focus:ring-black"
                          >
                            <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        ) : (
                          <span
                            aria-label="Invoice attached"
                            className="inline-flex items-center justify-center rounded border border-black bg-white p-1 text-black"
                          >
                            <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setInvoiceUploadRecord(record)
                            setInvoiceUploadMediaName("")
                            setInvoiceUploadMediaData(null)
                          }}
                          className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Add
                        </button>
                      )}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm text-[#55311c]">
                      {formatDateToGb(record.record_date)}
                    </td>
                    <td
                      className={`border border-[#e5e0dc] px-3 py-2 text-right font-mono text-sm font-bold ${
                        record.amount < 0 ? "text-[#d92d20]" : "text-[#217a4b]"
                      }`}
                    >
                      {formatCurrencyGbp(record.amount)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm text-[#55311c]">
                      <button
                        type="button"
                        onClick={() => handleOpenDescriptionEdit(record)}
                        className="w-full rounded px-2 py-1 text-sm text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                      >
                        {record.description || "-"}
                      </button>
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-right font-mono text-sm font-bold text-[#55311c]">
                      {formatCurrencyGbp(record.balance)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm">
                      <button
                        type="button"
                        onClick={() => handleDelete(record)}
                        disabled={deleteCashFlowMutation.isPending}
                        className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
            {records.length > 0 && (
              <tfoot>
                <tr>
                  <td
                    colSpan={5}
                    className="border border-[#7e6a5f] bg-[#bdb7b2] px-3 py-3 text-right text-sm font-bold text-[#333]"
                  >
                    Month total
                  </td>
                  <td className="border border-[#7e6a5f] bg-[#ffff00] px-3 py-3 text-right font-mono text-sm font-bold text-[#333]">
                    {formatCurrencyGbp(monthBalance)}
                  </td>
                  <td className="border border-[#7e6a5f] bg-[#bdb7b2]" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              New cash flow record
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Payment number will be assigned automatically based on the record
              date.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="cash-flow-form-date"
                className="mb-1 block text-sm font-semibold text-[#55311c]"
              >
                Date
              </label>
              <input
                id="cash-flow-form-date"
                type="date"
                value={form.recordDate}
                onChange={(event) =>
                  updateForm("recordDate", event.target.value)
                }
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div>
              <label
                htmlFor="cash-flow-form-amount"
                className="mb-1 block text-sm font-semibold text-[#55311c]"
              >
                Value
              </label>
              <input
                id="cash-flow-form-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                placeholder="-610.00"
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
              <p className="mt-1 text-xs text-[rgba(0,0,0,0.6)]">
                Use negative values for money out and positive values for money in.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="cash-flow-form-description"
                className="mb-1 block text-sm font-semibold text-[#55311c]"
              >
                Description
              </label>
              <textarea
                id="cash-flow-form-description"
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
                rows={3}
                placeholder="Council tax control"
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#55311c]">
                <input
                  type="checkbox"
                  checked={form.hasInvoice}
                  onChange={(event) =>
                    updateForm("hasInvoice", event.target.checked)
                  }
                  className="h-4 w-4 accent-[#8c7569]"
                />
                Invoice
              </label>
              {form.hasInvoice && (
                <div className="mt-3 space-y-3">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleInvoiceFileChange}
                    className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c]"
                  />
                  {form.invoiceMediaData && (
                    <div className="rounded border border-[#e5e0dc] bg-white p-2 text-xs text-[#55311c]">
                      <p className="font-semibold">
                        {form.invoiceMediaName || "Invoice media"}
                      </p>
                      {isImageDataUrl(form.invoiceMediaData) && (
                        <img
                          src={form.invoiceMediaData}
                          alt="Invoice preview"
                          className="mt-2 max-h-24 rounded border border-[#d9d0ca]"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => handleDialogChange(false)}
              disabled={createCashFlowMutation.isPending}
              className="rounded border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createCashFlowMutation.isPending}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createCashFlowMutation.isPending ? "Saving..." : "Save record"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(invoiceUploadRecord)}
        onOpenChange={(open) => {
          if (!open) resetInvoiceUploadDialog()
        }}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              Add invoice media
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Select the invoice file for payment #
              {invoiceUploadRecord?.payment_number}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleExistingInvoiceFileChange}
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c]"
            />
            {invoiceUploadMediaData && (
              <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm text-[#55311c]">
                <p className="font-semibold">
                  {invoiceUploadMediaName || "Invoice media"}
                </p>
                {isImageDataUrl(invoiceUploadMediaData) && (
                  <img
                    src={invoiceUploadMediaData}
                    alt="Invoice preview"
                    className="mt-3 max-h-48 rounded border border-[#d9d0ca] bg-white"
                  />
                )}
                {isPdfDataUrl(invoiceUploadMediaData) && (
                  <p className="mt-2 text-xs text-[rgba(0,0,0,0.65)]">
                    PDF selected.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={resetInvoiceUploadDialog}
              disabled={updateCashFlowMutation.isPending}
              className="rounded border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveExistingInvoice}
              disabled={updateCashFlowMutation.isPending}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateCashFlowMutation.isPending ? "Saving..." : "Save invoice"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingDescriptionRecord)}
        onOpenChange={(open) => {
          if (!open) resetDescriptionEditDialog()
        }}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              Edit description
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Update the description for payment #
              {editingDescriptionRecord?.payment_number}.
            </DialogDescription>
          </DialogHeader>

          <textarea
            value={editingDescriptionValue}
            onChange={(event) => setEditingDescriptionValue(event.target.value)}
            rows={4}
            placeholder="Description"
            className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
          />

          <DialogFooter>
            <button
              type="button"
              onClick={resetDescriptionEditDialog}
              disabled={updateCashFlowMutation.isPending}
              className="rounded border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDescriptionEdit}
              disabled={updateCashFlowMutation.isPending}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateCashFlowMutation.isPending ? "Saving..." : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReportDialogOpen} onOpenChange={handleReportDialogChange}>
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              Cash flow invoice report
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Select the month range, preview the PDF, and send it by email.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label
                    htmlFor="cash-flow-report-month-from"
                    className="mb-1 block text-sm font-semibold text-[#55311c]"
                  >
                    From
                  </label>
                  <input
                    id="cash-flow-report-month-from"
                    type="month"
                    value={reportMonthFrom}
                    onChange={(event) => {
                      setReportMonthFrom(event.target.value)
                      resetInvoiceReportPreview()
                    }}
                    className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cash-flow-report-month-to"
                    className="mb-1 block text-sm font-semibold text-[#55311c]"
                  >
                    To
                  </label>
                  <input
                    id="cash-flow-report-month-to"
                    type="month"
                    value={reportMonthTo}
                    onChange={(event) => {
                      setReportMonthTo(event.target.value)
                      resetInvoiceReportPreview()
                    }}
                    className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="cash-flow-report-email"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Email
                </label>
                <input
                  id="cash-flow-report-email"
                  type="email"
                  value={reportEmail}
                  onChange={(event) => setReportEmail(event.target.value)}
                  placeholder="report@email.com"
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm font-semibold text-[#55311c]">
                <input
                  type="checkbox"
                  checked={includeInvoiceReportTable}
                  onChange={(event) => {
                    setIncludeInvoiceReportTable(event.target.checked)
                    resetInvoiceReportPreview()
                  }}
                  className="h-4 w-4 accent-[#8c7569]"
                />
                Include table before invoices
              </label>

              {reportPdfDataUrl && (
                <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm text-[#55311c]">
                  <p className="font-semibold">{reportFileName}</p>
                  <p className="mt-1 text-xs text-[rgba(0,0,0,0.65)]">
                    {reportInvoiceCount} invoice(s) included
                  </p>
                </div>
              )}
              {isGeneratingInvoiceReport && (
                <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm font-semibold text-[#55311c]">
                  Generating preview...
                </div>
              )}
            </div>

            <div className="min-h-[520px] rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3">
              {reportPdfPreviewUrl ? (
                <iframe
                  title="Cash flow invoice report preview"
                  src={reportPdfPreviewUrl}
                  className="h-[520px] w-full rounded border border-[#d9d0ca] bg-white"
                />
              ) : (
                <div className="flex h-[520px] items-center justify-center rounded border border-dashed border-[#d9d0ca] bg-white px-6 text-center text-sm text-[rgba(0,0,0,0.65)]">
                  Generate the report to preview the PDF here.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => handleReportDialogChange(false)}
              disabled={isGeneratingInvoiceReport || isSendingInvoiceReport}
              className="rounded border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSendInvoiceReport}
              disabled={isGeneratingInvoiceReport || isSendingInvoiceReport}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingInvoiceReport ? "Sending..." : "Send PDF"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(invoicePreview)}
        onOpenChange={(open) => {
          if (!open) setInvoicePreview(null)
        }}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              Invoice #{invoicePreview?.payment_number}
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              {invoicePreview
                ? `${invoicePreview.description} | ${formatDateToGb(invoicePreview.record_date)}`
                : "Invoice media"}
            </DialogDescription>
          </DialogHeader>

          {invoicePreview?.invoice_media_data && (
            <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#55311c]">
                  {invoicePreview.invoice_media_name || "Invoice media"}
                </p>
                <a
                  href={invoicePreview.invoice_media_data}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-[#8c7569] bg-white px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                >
                  Open in new tab
                </a>
              </div>

              {isImageDataUrl(invoicePreview.invoice_media_data) ? (
                <img
                  src={invoicePreview.invoice_media_data}
                  alt={invoicePreview.invoice_media_name || "Invoice media"}
                  className="max-h-[70vh] w-full rounded border border-[#d9d0ca] bg-white object-contain"
                />
              ) : isPdfDataUrl(invoicePreview.invoice_media_data) ? (
                <iframe
                  title={invoicePreview.invoice_media_name || "Invoice PDF"}
                  src={invoicePreview.invoice_media_data}
                  className="h-[70vh] w-full rounded border border-[#d9d0ca] bg-white"
                />
              ) : (
                <div className="rounded border border-[#d9d0ca] bg-white p-6 text-center text-sm text-[rgba(0,0,0,0.7)]">
                  Preview is not available for this file type. Use Open in new
                  tab to view the media.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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

  const buildings = (buildingsData?.data || []) as Building[]

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
    <div className="overflow-x-auto">
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

  const buildings = (buildingsData?.data || []) as Building[]
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
    <div className="overflow-x-auto">
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
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [typeFilter, setTypeFilter] = useState<"" | "general" | "recycle">("")
  const [statusFilter, setStatusFilter] = useState<"" | "miss" | "late">("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const [editingBinRecord, setEditingBinRecord] =
    useState<BinMissCollectionRecord | null>(null)
  const [editedBinDate, setEditedBinDate] = useState("")
  const [editedBinTime, setEditedBinTime] = useState("")
  const [editedBinType, setEditedBinType] = useState<"general" | "recycle">(
    "general",
  )
  const [editedBinStatus, setEditedBinStatus] = useState<"miss" | "late">(
    "miss",
  )
  const [isSavingBinRecord, setIsSavingBinRecord] = useState(false)
  const [deletingBinRecordId, setDeletingBinRecordId] =
    useState<EntityId | null>(null)
  const [isConfirmingBinDelete, setIsConfirmingBinDelete] = useState(false)
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

  const toDateInputValue = (value: string) => {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return ""
    const year = dt.getFullYear()
    const month = String(dt.getMonth() + 1).padStart(2, "0")
    const day = String(dt.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const toTimeInputValue = (value: string) => {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return ""
    const hours = String(dt.getHours()).padStart(2, "0")
    const minutes = String(dt.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
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
        ["Date", "Time", "Type", "Status"].join(","),
        ...fullResult.data.map((item) =>
          [
            formatCsvValue(formatDate(item.data)),
            formatCsvValue(formatTime(item.data)),
            formatCsvValue(item.collection_type),
            formatCsvValue(item.collection_status),
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

  const invalidateBinsRecords = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bins"] })
  }

  const handleOpenBinRecordEdit = (item: BinMissCollectionRecord) => {
    setEditingBinRecord(item)
    setEditedBinDate(toDateInputValue(item.data))
    setEditedBinTime(toTimeInputValue(item.data))
    setEditedBinType(item.collection_type === "recycle" ? "recycle" : "general")
    setEditedBinStatus(item.collection_status === "late" ? "late" : "miss")
    setIsConfirmingBinDelete(false)
  }

  const handleBinRecordKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    item: BinMissCollectionRecord,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    handleOpenBinRecordEdit(item)
  }

  const handleSaveBinRecordEdit = async () => {
    if (!editingBinRecord) return
    if (!editedBinDate || !editedBinTime) {
      showErrorToast("Date and time are required")
      return
    }

    const nextDate = new Date(`${editedBinDate}T${editedBinTime}:00`)
    if (Number.isNaN(nextDate.getTime())) {
      showErrorToast("Invalid date or time")
      return
    }

    try {
      setIsSavingBinRecord(true)
      await apiCall(`/api/v1/bins/${editingBinRecord.id}`, {
        method: "PATCH",
        body: {
          data: nextDate.toISOString(),
          collection_type: editedBinType,
          collection_status: editedBinStatus,
          miss_collection: editedBinStatus === "miss",
        },
      })
      await invalidateBinsRecords()
      setEditingBinRecord(null)
      setIsConfirmingBinDelete(false)
      showSuccessToast("Bin record updated successfully")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update bin record"
      showErrorToast(message)
    } finally {
      setIsSavingBinRecord(false)
    }
  }

  const handleDeleteBinRecordEdit = async () => {
    if (!editingBinRecord) return

    if (!isConfirmingBinDelete) {
      setIsConfirmingBinDelete(true)
      return
    }

    try {
      setDeletingBinRecordId(editingBinRecord.id)
      await apiCall(`/api/v1/bins/${editingBinRecord.id}`, {
        method: "DELETE",
      })
      await invalidateBinsRecords()
      setEditingBinRecord(null)
      setIsConfirmingBinDelete(false)
      showSuccessToast("Bin record deleted successfully")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete bin record"
      showErrorToast(message)
    } finally {
      setDeletingBinRecordId(null)
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
            Old miss collections pending collected:
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
              <option value="late">Collected</option>
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
                <tr
                  key={String(item.id)}
                  className="cursor-pointer hover:bg-[#f5f1ee] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#8c7569]"
                  onClick={() => handleOpenBinRecordEdit(item)}
                  onKeyDown={(event) => handleBinRecordKeyDown(event, item)}
                  role="button"
                  tabIndex={0}
                  title="Edit bin record"
                >
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
                      ? "Collected"
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

      {editingBinRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-lg font-bold text-[#55311c]">
              Edit bin record
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Update the collection record
              {editingBinRecord.building_nome
                ? ` for ${editingBinRecord.building_nome}`
                : ""}
              .
            </p>

            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="bins-edit-date"
                  >
                    Date
                  </label>
                  <input
                    id="bins-edit-date"
                    type="date"
                    value={editedBinDate}
                    onChange={(event) => {
                      setEditedBinDate(event.target.value)
                      setIsConfirmingBinDelete(false)
                    }}
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="bins-edit-time"
                  >
                    Time
                  </label>
                  <input
                    id="bins-edit-time"
                    type="time"
                    value={editedBinTime}
                    onChange={(event) => {
                      setEditedBinTime(event.target.value)
                      setIsConfirmingBinDelete(false)
                    }}
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="bins-edit-type"
                >
                  Type
                </label>
                <select
                  id="bins-edit-type"
                  value={editedBinType}
                  onChange={(event) => {
                    setEditedBinType(
                      event.target.value === "recycle"
                        ? "recycle"
                        : "general",
                    )
                    setIsConfirmingBinDelete(false)
                  }}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="general">General</option>
                  <option value="recycle">Recycle</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="bins-edit-status"
                >
                  Status
                </label>
                <select
                  id="bins-edit-status"
                  value={editedBinStatus}
                  onChange={(event) => {
                    setEditedBinStatus(
                      event.target.value === "late" ? "late" : "miss",
                    )
                    setIsConfirmingBinDelete(false)
                  }}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="miss">Miss Collection</option>
                  <option value="late">Collected</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleDeleteBinRecordEdit}
                disabled={
                  isSavingBinRecord ||
                  deletingBinRecordId === editingBinRecord.id
                }
                className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition-all duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {deletingBinRecordId === editingBinRecord.id
                  ? "Deleting..."
                  : isConfirmingBinDelete
                    ? "Confirm?"
                    : "Delete"}
              </button>
              <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingBinRecord(null)
                    setIsConfirmingBinDelete(false)
                  }}
                  disabled={deletingBinRecordId === editingBinRecord.id}
                  className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBinRecordEdit}
                  disabled={
                    isSavingBinRecord ||
                    deletingBinRecordId === editingBinRecord.id
                  }
                  className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isSavingBinRecord ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function HoursInvoiceLauncherDialog({
  open,
  onOpenChange,
  workerLabel,
  workerName,
  descriptionSubject,
  storageKey,
  onLaunched,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workerLabel: string
  workerName: string
  descriptionSubject: string
  storageKey: string
  onLaunched: (entries: WorkerInvoiceHourEntry[]) => void
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [invoiceHours, setInvoiceHours] = useState("")
  const [invoiceAmount, setInvoiceAmount] = useState("")
  const [includeInvoiceTable, setIncludeInvoiceTable] = useState(true)
  const [invoiceMediaName, setInvoiceMediaName] = useState("")
  const [invoiceMediaData, setInvoiceMediaData] = useState<string | null>(null)
  const [invoicePdfDataUrl, setInvoicePdfDataUrl] = useState("")
  const [invoicePdfFileName, setInvoicePdfFileName] = useState("")
  const [isGeneratingInvoicePdf, setIsGeneratingInvoicePdf] = useState(false)
  const [isLaunchingInvoice, setIsLaunchingInvoice] = useState(false)

  const resetForm = () => {
    setInvoiceHours("")
    setInvoiceAmount("")
    setIncludeInvoiceTable(true)
    setInvoiceMediaName("")
    setInvoiceMediaData(null)
    setInvoicePdfDataUrl("")
    setInvoicePdfFileName("")
  }

  const clearPreview = () => {
    setInvoicePdfDataUrl("")
    setInvoicePdfFileName("")
  }

  const handleDialogChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) resetForm()
  }

  const handleInvoiceFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setInvoiceMediaName(file.name)
      setInvoiceMediaData(dataUrl)
      clearPreview()
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not read invoice media",
      )
    } finally {
      event.target.value = ""
    }
  }

  const generateInvoicePdf = async ({
    showToast = true,
  }: { showToast?: boolean } = {}) => {
    const parsedHours = Number(invoiceHours)
    if (!invoiceHours.trim() || !Number.isFinite(parsedHours) || parsedHours <= 0) {
      if (showToast) showErrorToast("Total hours must be a valid number")
      return null
    }

    setIsGeneratingInvoicePdf(true)
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 44
      const invoiceDate = new Date().toLocaleDateString("en-GB")
      const fileDate = new Date().toISOString().slice(0, 10)
      const fileName = `${descriptionSubject.toLowerCase()}-hours-invoice-${fileDate}.pdf`
      const parsedAmount = Number(invoiceAmount)
      const hasAmount = invoiceAmount.trim() && Number.isFinite(parsedAmount)
      const monthKey = getCurrentMonthInputValue()
      const monthLabel = buildMonthRangeLabel(monthKey, monthKey)

      doc.setFontSize(18)
      doc.text(`${workerLabel} Hours Payment Invoice`, margin, 48)
      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, margin, 68)

      const invoiceSummaryRows = [
        ["Invoice date", invoiceDate],
        [workerLabel, workerName || workerLabel],
        ["Month", monthLabel],
        ["Total hours", formatInvoiceHours(parsedHours)],
        ["Amount", hasAmount ? formatCurrencyGbp(-Math.abs(parsedAmount)) : "-"],
        ["Attached media", invoiceMediaName || "None"],
      ]

      if (includeInvoiceTable) {
        autoTable(doc, {
          startY: 100,
          head: [["Field", "Value"]],
          body: invoiceSummaryRows,
          theme: "grid",
          styles: {
            fontSize: 10,
            cellPadding: 7,
            lineColor: [180, 180, 180],
            lineWidth: 0.4,
          },
          headStyles: {
            fillColor: [140, 117, 105],
            textColor: 255,
            fontStyle: "bold",
          },
          columnStyles: {
            0: { fontStyle: "bold", cellWidth: 150 },
          },
        })
      } else {
        doc.setFontSize(11)
        invoiceSummaryRows.forEach(([label, value], index) => {
          doc.text(`${label}: ${value}`, margin, 104 + index * 22, {
            maxWidth: pageWidth - margin * 2,
          })
        })
      }

      if (invoiceMediaData) {
        doc.addPage()
        doc.setFontSize(14)
        doc.text("Supporting media", margin, 44)
        doc.setFontSize(10)
        doc.text(invoiceMediaName || "Attached media", margin, 64, {
          maxWidth: pageWidth - margin * 2,
        })

        if (isImageDataUrl(invoiceMediaData)) {
          try {
            const image = new Image()
            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve()
              image.onerror = () => reject(new Error("Could not load invoice media"))
              image.src = invoiceMediaData
            })
            const maxWidth = pageWidth - margin * 2
            const maxHeight = pageHeight - 110
            const ratio = Math.min(
              maxWidth / Math.max(image.naturalWidth, 1),
              maxHeight / Math.max(image.naturalHeight, 1),
            )
            const width = image.naturalWidth * ratio
            const height = image.naturalHeight * ratio
            const x = margin + (maxWidth - width) / 2
            const imageFormat = invoiceMediaData.startsWith("data:image/png")
              ? "PNG"
              : "JPEG"
            doc.addImage(invoiceMediaData, imageFormat, x, 84, width, height)
          } catch {
            doc.text("The attached image could not be added to the PDF.", margin, 96)
          }
        } else if (isPdfDataUrl(invoiceMediaData)) {
          doc.text(
            "A PDF media file was attached. The generated invoice references the file, but browser-side PDF merging is not available.",
            margin,
            96,
            { maxWidth: pageWidth - margin * 2 },
          )
        } else {
          doc.text("Preview is not available for this media type.", margin, 96)
        }
      }

      const dataUrl = doc.output("datauristring")
      const hours = Number(parsedHours.toFixed(2))
      setInvoicePdfDataUrl(dataUrl)
      setInvoicePdfFileName(fileName)
      if (showToast) showSuccessToast("Invoice preview generated")
      return { dataUrl, fileName, hours, monthKey }
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not generate invoice",
      )
      return null
    } finally {
      setIsGeneratingInvoicePdf(false)
    }
  }

  const handleLaunchInvoice = async () => {
    const parsedAmount = Number(invoiceAmount)
    if (!invoiceAmount.trim() || !Number.isFinite(parsedAmount)) {
      showErrorToast("Amount must be a valid number")
      return
    }
    if (parsedAmount === 0) {
      showErrorToast("Amount must be different from zero")
      return
    }

    try {
      setIsLaunchingInvoice(true)
      const generatedInvoice = await generateInvoicePdf({ showToast: false })
      if (!generatedInvoice) return

      const amount = parsedAmount < 0 ? parsedAmount : -Math.abs(parsedAmount)
      const hoursLabel = Number(generatedInvoice.hours.toFixed(2)).toString()

      await apiCall("/api/v1/cash-flow/", {
        method: "POST",
        body: {
          has_invoice: true,
          invoice_media_name: generatedInvoice.fileName,
          invoice_media_data: generatedInvoice.dataUrl,
          record_date: getTodayDateInputValue(),
          amount,
          description: `${descriptionSubject} ${hoursLabel} hours payment`,
        },
      })

      const nextEntries = [
        ...readInvoiceHoursFromStorage(storageKey),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          monthKey: generatedInvoice.monthKey,
          hours: generatedInvoice.hours,
          workerName: workerName || workerLabel,
          createdAt: new Date().toISOString(),
          fileName: generatedInvoice.fileName,
        },
      ]
      writeInvoiceHoursToStorage(storageKey, nextEntries)
      onLaunched(nextEntries)
      queryClient.invalidateQueries({ queryKey: ["cash-flow"] })
      showSuccessToast(`${workerLabel} invoice added to cash flow`)
      handleDialogChange(false)
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not add invoice to cash flow",
      )
    } finally {
      setIsLaunchingInvoice(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const parsedHours = Number(invoiceHours)
    if (!invoiceHours.trim() || !Number.isFinite(parsedHours) || parsedHours <= 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      generateInvoicePdf({ showToast: false })
    }, 200)

    return () => window.clearTimeout(timeoutId)
  }, [
    open,
    invoiceHours,
    invoiceAmount,
    includeInvoiceTable,
    invoiceMediaData,
    invoiceMediaName,
    workerLabel,
    workerName,
  ])

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-[#55311c]">
            {workerLabel} hours invoice
          </DialogTitle>
          <DialogDescription className="text-[rgba(0,0,0,0.7)]">
            Enter the total hours, amount and optional media to preview the PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] min-h-0 gap-4 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c]"
                htmlFor={`${descriptionSubject.toLowerCase()}-invoice-hours`}
              >
                Total hours
              </label>
              <input
                id={`${descriptionSubject.toLowerCase()}-invoice-hours`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={invoiceHours}
                onChange={(event) => {
                  setInvoiceHours(event.target.value)
                  clearPreview()
                }}
                placeholder="20.00"
                className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>

            <div>
              <label
                className="block text-sm font-semibold text-[#55311c]"
                htmlFor={`${descriptionSubject.toLowerCase()}-invoice-amount`}
              >
                Amount
              </label>
              <input
                id={`${descriptionSubject.toLowerCase()}-invoice-amount`}
                type="number"
                step="0.01"
                inputMode="decimal"
                value={invoiceAmount}
                onChange={(event) => {
                  setInvoiceAmount(event.target.value)
                  clearPreview()
                }}
                placeholder="-120.00"
                className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm font-semibold text-[#55311c]">
              <input
                type="checkbox"
                checked={includeInvoiceTable}
                onChange={(event) => {
                  setIncludeInvoiceTable(event.target.checked)
                  clearPreview()
                }}
                className="h-4 w-4 accent-[#8c7569]"
              />
              Include summary table in PDF
            </label>

            <div>
              <label
                className="block text-sm font-semibold text-[#55311c]"
                htmlFor={`${descriptionSubject.toLowerCase()}-invoice-media`}
              >
                Media
              </label>
              <input
                id={`${descriptionSubject.toLowerCase()}-invoice-media`}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleInvoiceFileChange}
                className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
              {invoiceMediaData && (
                <div className="mt-3 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm text-[#55311c]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">
                      {invoiceMediaName || "Attached media"}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceMediaName("")
                        setInvoiceMediaData(null)
                        clearPreview()
                      }}
                      className="shrink-0 rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                    >
                      Remove
                    </button>
                  </div>
                  {isImageDataUrl(invoiceMediaData) && (
                    <img
                      src={invoiceMediaData}
                      alt="Invoice media preview"
                      className="mt-3 max-h-32 rounded border border-[#d9d0ca] bg-white"
                    />
                  )}
                </div>
              )}
            </div>

            {invoicePdfDataUrl && (
              <a
                href={invoicePdfDataUrl}
                download={invoicePdfFileName}
                className="block w-full rounded-lg bg-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Download preview
              </a>
            )}
            {isGeneratingInvoicePdf && (
              <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm font-semibold text-[#55311c]">
                Generating preview...
              </div>
            )}
          </div>

          <div className="min-h-[520px] rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3">
            {invoicePdfDataUrl ? (
              <iframe
                title={`${workerLabel} hours invoice preview`}
                src={invoicePdfDataUrl}
                className="h-[520px] w-full rounded border border-[#d9d0ca] bg-white"
              />
            ) : (
              <div className="flex h-[520px] items-center justify-center rounded border border-dashed border-[#d9d0ca] bg-white px-6 text-center text-sm text-[rgba(0,0,0,0.65)]">
                Enter hours to preview the PDF here.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => handleDialogChange(false)}
            disabled={isGeneratingInvoicePdf || isLaunchingInvoice}
            className="rounded border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleLaunchInvoice}
            disabled={isGeneratingInvoicePdf || isLaunchingInvoice}
            className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLaunchingInvoice ? "Launching..." : "Launch invoice"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ContractorsContent() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false)
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false)
  const [contractorInvoiceHourEntries, setContractorInvoiceHourEntries] =
    useState<WorkerInvoiceHourEntry[]>(() =>
      readInvoiceHoursFromStorage(CONTRACTOR_INVOICE_HOURS_STORAGE_KEY),
    )
  const [selectedVisit, setSelectedVisit] =
    useState<ContractorVisitAdmin | null>(null)
  const [mediaForm, setMediaForm] = useState<ContractorMediaFormState>(
    getEmptyContractorMediaForm,
  )
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
  const currentMonthKey = getCurrentMonthInputValue()
  const contractorInvoiceHours = contractorInvoiceHourEntries
    .filter((entry) => entry.monthKey === currentMonthKey)
    .reduce((sum, entry) => sum + entry.hours, 0)

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
      setMediaForm(getEmptyContractorMediaForm())
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
      setMediaForm(getEmptyContractorMediaForm())
    }
  }

  const handleOpenMediaDialog = (visit: ContractorVisitAdmin) => {
    setSelectedVisit(visit)
    setMediaForm({
      slots: getContractorVisitMediaSlots(visit),
    })
    setIsMediaDialogOpen(true)
  }

  const updateMediaSlot = (
    slotIndex: number,
    updater: (slot: ContractorMediaSlotState) => ContractorMediaSlotState,
  ) => {
    setMediaForm((previous) => ({
      slots: previous.slots.map((slot, index) =>
        index === slotIndex ? updater(slot) : slot,
      ),
    }))
  }

  const handleMediaFileChange = async (
    slotIndex: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      updateMediaSlot(slotIndex, () => ({
        name: file.name,
        data: dataUrl,
      }))
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
      payload: buildContractorMediaPayload(mediaForm),
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
              Review contractor check-in records and attach up to 4 internal
              media files for follow-up.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3 flex flex-col gap-2 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold text-[#217a4b]">
                Invoices launched {formatInvoiceHours(contractorInvoiceHours)}
              </span>
              <button
                type="button"
                onClick={() => setIsInvoiceDialogOpen(true)}
                className="rounded-lg border border-[#8c7569] bg-white px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
              >
                Invoice
              </button>
            </div>
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
                  Media
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
                visits.map((visit) => {
                  const mediaSlots = getContractorVisitMediaSlots(visit)
                    .map((slot, index) => ({
                      ...slot,
                      slotNumber: index + 1,
                    }))
                    .filter((slot) => slot.data)
                  const hasMedia = mediaSlots.length > 0

                  return (
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
                        {hasMedia ? (
                          <div className="grid max-w-[20rem] grid-cols-1 gap-2 sm:grid-cols-2">
                            {mediaSlots.map((slot) => (
                              <div
                                key={`${visit.id}-media-${slot.slotNumber}`}
                                className="rounded border border-[#e5e0dc] bg-[#faf8f6] p-2"
                              >
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.7)]">
                                  Media {slot.slotNumber}
                                </p>
                                {isImageDataUrl(slot.data) && (
                                  <img
                                    src={slot.data ?? undefined}
                                    alt={slot.name || "Contractor media"}
                                    className="mb-2 h-16 w-16 rounded border border-[#d9d0ca] object-cover"
                                  />
                                )}
                                <a
                                  href={slot.data ?? undefined}
                                  download={
                                    slot.name ||
                                    `contractor-media-${slot.slotNumber}`
                                  }
                                  className="break-words text-xs font-semibold text-[#8c7569] underline"
                                >
                                  {slot.name ||
                                    `Download media ${slot.slotNumber}`}
                                </a>
                              </div>
                            ))}
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
                          {hasMedia ? "Edit media" : "Add media"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isMediaDialogOpen} onOpenChange={handleMediaDialogChange}>
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              Contractor media
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Attach up to 4 internal media files to this contractor record.
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

              <div className="grid gap-4 md:grid-cols-2">
                {mediaForm.slots.map((slot, slotIndex) => (
                  <div
                    key={`contractor-media-slot-${slotIndex + 1}`}
                    className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#55311c]">
                        Media {slotIndex + 1}
                      </p>
                      {slot.data && (
                        <button
                          type="button"
                          onClick={() =>
                            updateMediaSlot(slotIndex, () =>
                              createEmptyContractorMediaSlot(),
                            )
                          }
                          className="rounded border border-[#d9d0ca] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Remove media
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor={`contractor-extra-media-name-${slotIndex + 1}`}
                          className="mb-1 block text-sm font-semibold text-[#55311c]"
                        >
                          Media name
                        </label>
                        <input
                          id={`contractor-extra-media-name-${slotIndex + 1}`}
                          type="text"
                          value={slot.name}
                          onChange={(event) =>
                            updateMediaSlot(slotIndex, (previous) => ({
                              ...previous,
                              name: event.target.value,
                            }))
                          }
                          placeholder={`Enter a media name for slot ${slotIndex + 1}`}
                          className="w-full rounded border border-[#d9d0ca] bg-white px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`contractor-extra-media-file-${slotIndex + 1}`}
                          className="mb-1 block text-sm font-semibold text-[#55311c]"
                        >
                          Media file
                        </label>
                        <input
                          id={`contractor-extra-media-file-${slotIndex + 1}`}
                          type="file"
                          onChange={(event) =>
                            handleMediaFileChange(slotIndex, event)
                          }
                          className="block w-full text-sm text-[#55311c] file:mr-4 file:rounded file:border-0 file:bg-[#8c7569] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#55311c]"
                        />
                      </div>

                      {slot.data ? (
                        <div className="rounded border border-[#e5e0dc] bg-white p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.7)]">
                            Current media preview
                          </p>
                          {isImageDataUrl(slot.data) ? (
                            <img
                              src={slot.data}
                              alt={
                                slot.name || `Contractor media ${slotIndex + 1}`
                              }
                              className="max-h-56 rounded border border-[#d9d0ca] object-contain"
                            />
                          ) : (
                            <a
                              href={slot.data}
                              download={
                                slot.name || `contractor-media-${slotIndex + 1}`
                              }
                              className="text-sm font-semibold text-[#8c7569] underline"
                            >
                              Download current media
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-[rgba(0,0,0,0.55)]">
                          No media selected for this slot.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

      <HoursInvoiceLauncherDialog
        open={isInvoiceDialogOpen}
        onOpenChange={setIsInvoiceDialogOpen}
        workerLabel="Contractor"
        workerName="Contractor"
        descriptionSubject="Contractor"
        storageKey={CONTRACTOR_INVOICE_HOURS_STORAGE_KEY}
        onLaunched={setContractorInvoiceHourEntries}
      />
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
  const [invoiceTrigger, setInvoiceTrigger] = useState(0)

  const handleOpenInvoice = () => {
    setActiveSubTab("summary")
    setInvoiceTrigger((current) => current + 1)
  }

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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenInvoice}
              className="rounded-lg border border-[#8c7569] bg-white px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Invoice
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

      {activeSubTab === "summary" ? (
        <CleanerSummary invoiceTrigger={invoiceTrigger} />
      ) : (
        <CleanerRegister />
      )}
    </div>
  )
}

function CaretakerContent() {
  const [activeSubTab, setActiveSubTab] = useState<
    "summary" | "bins" | "register" | "schedules"
  >("summary")
  const [reportTrigger, setReportTrigger] = useState(0)
  const [invoiceTrigger, setInvoiceTrigger] = useState(0)

  const handleOpenReport = () => {
    setActiveSubTab("summary")
    setReportTrigger((current) => current + 1)
  }

  const handleOpenInvoice = () => {
    setActiveSubTab("summary")
    setInvoiceTrigger((current) => current + 1)
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
              onClick={handleOpenInvoice}
              className="rounded-lg border border-[#8c7569] bg-white px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Invoice
            </button>
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
        invoiceTrigger={invoiceTrigger}
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
  const [deletingHistoryDate, setDeletingHistoryDate] = useState<string | null>(
    null,
  )
  const [editingCertificate, setEditingCertificate] =
    useState<FireAlarmExternalCertificate | null>(null)
  const [deletingCertificateId, setDeletingCertificateId] =
    useState<EntityId | null>(null)
  const [certificatePreview, setCertificatePreview] =
    useState<CertificateMediaPreviewState | null>(null)
  const [callPointListState, setCallPointListState] =
    useState<FireAlarmCallPointListState | null>(null)
  const [certificateForm, setCertificateForm] =
    useState<FireAlarmExternalCertificateFormState>(
      getEmptyFireAlarmExternalCertificateForm,
    )
  const deferredCertificateSearch = useDeferredValue(certificateSearch.trim())
  const isEditingCertificate = Boolean(editingCertificate)
  const callPointListBuilding = useMemo(
    () =>
      callPointListState
        ? getFireAlarmBuildingConfig(callPointListState.buildingId)
        : null,
    [callPointListState],
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FIRE_ALARM_STORAGE_KEY)
      const deletedDates = readDateSetFromStorage(
        FIRE_ALARM_DELETED_DATES_STORAGE_KEY,
      )
      if (!raw) {
        const initialLogs = Object.fromEntries(
          Object.entries(FIRE_ALARM_INITIAL_LOGS).filter(
            ([date]) => !deletedDates.has(date),
          ),
        )
        localStorage.setItem(
          FIRE_ALARM_STORAGE_KEY,
          JSON.stringify(initialLogs),
        )
        setAllLogs(initialLogs)
        setRows(initialLogs[selectedDate] || getDefaultFireAlarmRows())
        return
      }
      const parsed = JSON.parse(raw) as FireAlarmLogByDate
      const merged = mergeFireAlarmLogsWithInitialSeed(parsed)
      const filteredLogs = Object.fromEntries(
        Object.entries(merged).filter(([date]) => !deletedDates.has(date)),
      ) as FireAlarmLogByDate
      localStorage.setItem(FIRE_ALARM_STORAGE_KEY, JSON.stringify(filteredLogs))
      setAllLogs(filteredLogs)
      setRows(filteredLogs[selectedDate] || getDefaultFireAlarmRows())
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

  const { data: certificateBuildingsData } = useQuery<
    ApiListResponse<Building>
  >({
    queryKey: ["buildings", "fire-alarm-certificates"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
    enabled: activeView === "certificates" || isCertificateDialogOpen,
  })

  const buildExternalCertificatePayload = () => ({
    building_id: certificateForm.buildingId,
    certificate_date: certificateForm.certificateDate,
    media_1_name: certificateForm.media1Name || null,
    media_1_data: certificateForm.media1Data,
    media_2_name: certificateForm.media2Name || null,
    media_2_data: certificateForm.media2Data,
  })

  const createExternalCertificateMutation = useMutation({
    mutationFn: (payload: {
      building_id: string
      certificate_date: string
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
      showSuccessToast("Certificate saved")
      setEditingCertificate(null)
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
          : "Could not save the certificate",
      )
    },
  })

  const updateExternalCertificateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: EntityId
      payload: {
        building_id: string
        certificate_date: string
        media_1_name?: string | null
        media_1_data?: string | null
        media_2_name?: string | null
        media_2_data?: string | null
      }
    }) =>
      apiCall(`/api/v1/fire-alarm-external-certificates/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      showSuccessToast("Certificate updated")
      setEditingCertificate(null)
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
          : "Could not update the certificate",
      )
    },
  })

  const deleteExternalCertificateMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/fire-alarm-external-certificates/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      showSuccessToast("Certificate deleted")
      queryClient.invalidateQueries({
        queryKey: ["fire-alarm-external-certificates"],
      })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Could not delete the certificate",
      )
    },
    onSettled: () => {
      setDeletingCertificateId(null)
    },
  })

  const externalCertificates = externalCertificatesData?.data || []
  const externalCertificatesCount =
    externalCertificatesData?.count || externalCertificates.length
  const certificateBuildings = (certificateBuildingsData?.data ||
    []) as Building[]
  const isSavingCertificate =
    createExternalCertificateMutation.isPending ||
    updateExternalCertificateMutation.isPending

  const handleCertificateDialogChange = (open: boolean) => {
    setIsCertificateDialogOpen(open)
    if (!open) {
      setEditingCertificate(null)
      setCertificateForm(getEmptyFireAlarmExternalCertificateForm())
    }
  }

  const handleOpenCreateCertificateDialog = () => {
    setEditingCertificate(null)
    setCertificateForm(getEmptyFireAlarmExternalCertificateForm())
    setIsCertificateDialogOpen(true)
  }

  const handleEditExternalCertificate = (
    certificate: FireAlarmExternalCertificate,
  ) => {
    setEditingCertificate(certificate)
    setCertificateForm(
      getFireAlarmExternalCertificateFormFromRecord(certificate),
    )
    setIsCertificateDialogOpen(true)
  }

  const handleCertificatePreviewOpen = ({
    dataUrl,
    fileName,
    subtitle,
  }: CertificateMediaPreviewState) => {
    const normalisedSubtitle = subtitle.replace("â€¢", "|").replace("•", "|")

    setCertificatePreview({
      dataUrl,
      fileName: fileName.trim() || "certificate-document",
      subtitle: normalisedSubtitle,
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

  const handleSubmitExternalCertificate = () => {
    if (!certificateForm.buildingId) {
      showErrorToast("Building is required")
      return
    }
    if (!certificateForm.certificateDate) {
      showErrorToast("Date is required")
      return
    }

    const payload = buildExternalCertificatePayload()

    if (editingCertificate) {
      updateExternalCertificateMutation.mutate({
        id: editingCertificate.id,
        payload,
      })
      return
    }

    createExternalCertificateMutation.mutate(payload)
  }

  const handleDeleteExternalCertificate = (
    certificate: FireAlarmExternalCertificate,
  ) => {
    if (deleteExternalCertificateMutation.isPending) return

    const buildingLabel = certificate.building_name || "this building"
    const dateLabel = formatDateToGb(certificate.certificate_date)
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete the certificate for ${buildingLabel} on ${dateLabel}?`,
          )

    if (!confirmed) return

    setDeletingCertificateId(certificate.id)
    deleteExternalCertificateMutation.mutate(certificate.id)
  }

  const handleOpenHistoryRecord = (date: string) => {
    setSelectedDate(date)
    setActiveView("schedule")
  }

  const handleEditHistoryRecord = (date: string) => {
    setSelectedDate(date)
    setActiveView("schedule")
  }

  const handleDeleteHistoryRecord = (date: string) => {
    if (deletingHistoryDate) return

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete the fire alarm history record for ${formatDateToGb(date)}?`,
          )

    if (!confirmed) return

    try {
      setDeletingHistoryDate(date)

      const nextLogs = { ...allLogs }
      delete nextLogs[date]

      const deletedDates = readDateSetFromStorage(
        FIRE_ALARM_DELETED_DATES_STORAGE_KEY,
      )
      deletedDates.add(date)

      localStorage.setItem(FIRE_ALARM_STORAGE_KEY, JSON.stringify(nextLogs))
      writeDateSetToStorage(FIRE_ALARM_DELETED_DATES_STORAGE_KEY, deletedDates)

      setAllLogs(nextLogs)
      if (selectedDate === date) {
        setRows(getDefaultFireAlarmRows())
      }
      showSuccessToast("Fire alarm history record deleted")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not delete the fire alarm history record"
      showErrorToast(message)
    } finally {
      setDeletingHistoryDate(null)
    }
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
                subtitle: `${certificate.building_name || "Building"} • ${formatDateToGb(certificate.certificate_date)}`,
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
              subtitle: `${certificate.building_name || "Building"} • ${formatDateToGb(certificate.certificate_date)}`,
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
              Fire alarm certificates
            </h3>
            <p className="text-sm text-[rgba(0,0,0,0.65)]">
              Register only the building, date and up to 2 media files.
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
              onClick={handleOpenCreateCertificateDialog}
              className="rounded-lg bg-[#8c7569] px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Add certificate
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
                placeholder="Search by building"
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
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Building
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Date
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Media 1
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Media 2
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoadingExternalCertificates && (
                <tr>
                  <td
                    colSpan={5}
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
                      colSpan={5}
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
                      {certificate.building_name || "-"}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatDateToGb(certificate.certificate_date)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {renderCertificateMediaCell(certificate, 1)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {renderCertificateMediaCell(certificate, 2)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleEditExternalCertificate(certificate)
                          }
                          disabled={
                            isSavingCertificate ||
                            deleteExternalCertificateMutation.isPending
                          }
                          className="rounded-lg border border-[#8c7569] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteExternalCertificate(certificate)
                          }
                          disabled={deleteExternalCertificateMutation.isPending}
                          className="rounded-lg border border-[#d28a6f] px-3 py-2 text-xs font-semibold text-[#8a3d1b] transition-all duration-200 hover:bg-[#fff1ea] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingCertificateId === certificate.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
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
                {isEditingCertificate ? "Edit certificate" : "Add certificate"}
              </DialogTitle>
              <DialogDescription className="text-[rgba(0,0,0,0.7)]">
                {isEditingCertificate
                  ? "Update the building, date and up to 2 media files."
                  : "Record building, date and up to 2 media files."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="fire-alarm-certificate-form-building"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Building
                </label>
                <select
                  id="fire-alarm-certificate-form-building"
                  value={certificateForm.buildingId}
                  onChange={(event) =>
                    handleCertificateFieldChange(
                      "buildingId",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="">Select a building</option>
                  {certificateBuildings.map((building) => (
                    <option key={building.id} value={String(building.id)}>
                      {building.nome}
                    </option>
                  ))}
                </select>
              </div>
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
                onClick={handleSubmitExternalCertificate}
                disabled={isSavingCertificate}
                className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCertificate
                  ? "Saving..."
                  : isEditingCertificate
                    ? "Save changes"
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
              Choose a saved date to edit or remove the record.
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
          <table className="w-full min-w-[760px] border-collapse">
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
                  Actions
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Open actions menu"
                            disabled={Boolean(deletingHistoryDate)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#8c7569] bg-white text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <title>Actions</title>
                              <path d="M4 7h16" />
                              <path d="M4 12h16" />
                              <path d="M4 17h16" />
                            </svg>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={Boolean(deletingHistoryDate)}
                            onClick={() => handleOpenHistoryRecord(date)}
                          >
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={Boolean(deletingHistoryDate)}
                            onClick={() => handleEditHistoryRecord(date)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={Boolean(deletingHistoryDate)}
                            variant="destructive"
                            onClick={() => handleDeleteHistoryRecord(date)}
                          >
                            {deletingHistoryDate === date
                              ? "Deleting..."
                              : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
    const deletedDates = readDateSetFromStorage(
      FIRE_ALARM_DELETED_DATES_STORAGE_KEY,
    )
    if (deletedDates.delete(selectedDate)) {
      writeDateSetToStorage(FIRE_ALARM_DELETED_DATES_STORAGE_KEY, deletedDates)
    }
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
                    <div className="flex flex-col items-start gap-2">
                      <span>{row.callPoint}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCallPointListState({
                            buildingId: row.buildingId,
                            buildingLabel: row.buildingLabel,
                            currentCallPoint: row.callPoint,
                            currentLocation: row.location,
                          })
                        }
                        className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                      >
                        List
                      </button>
                    </div>
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

      <Dialog
        open={Boolean(callPointListState)}
        onOpenChange={(open) => {
          if (!open) setCallPointListState(null)
        }}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              {callPointListState?.buildingLabel || "Call points"}
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Ordered call points for this building.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {callPointListBuilding?.callPoints.map((callPoint, index) => {
              const location =
                callPointListBuilding.locations[
                  positiveModulo(index, callPointListBuilding.locations.length)
                ]
              const isCurrent =
                normalizeCallPoint(callPoint) ===
                normalizeCallPoint(callPointListState?.currentCallPoint || "")

              return (
                <div
                  key={`${callPointListBuilding.id}-${callPoint}`}
                  className={`rounded-lg border px-3 py-2 ${
                    isCurrent
                      ? "border-[#8c7569] bg-[#f5efe9]"
                      : "border-[#e5e0dc] bg-[#faf8f6]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#55311c]">
                        {String(index + 1).padStart(2, "0")} | {callPoint}
                      </p>
                      <p className="text-xs text-[rgba(0,0,0,0.68)]">
                        {location}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="rounded-full border border-[#8c7569] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#55311c]">
                        Current
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {callPointListState && (
            <p className="text-xs text-[rgba(0,0,0,0.68)]">
              Current row: {callPointListState.currentCallPoint} |{" "}
              {callPointListState.currentLocation}
            </p>
          )}
        </DialogContent>
      </Dialog>
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
  const deletedDatesStorageKey = `${storageKey}-deleted-dates`
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
      const deletedDates = readDateSetFromStorage(deletedDatesStorageKey)
      if (!raw) {
        const normalizedInitialLogs = Object.fromEntries(
          Object.entries(
            scheduleId === "light"
              ? normalizeLightScheduleLogs(initialLogs)
              : initialLogs,
          ).filter(([date]) => !deletedDates.has(date)),
        ) as FireAlarmLogByDate
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
      const filteredMerged = Object.fromEntries(
        Object.entries(merged).filter(([date]) => !deletedDates.has(date)),
      ) as FireAlarmLogByDate
      localStorage.setItem(storageKey, JSON.stringify(filteredMerged))
      setAllLogs(filteredMerged)
      setRows(
        filteredMerged[selectedDate] ||
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
  }, [
    deletedDatesStorageKey,
    emptyRows,
    initialLogs,
    scheduleId,
    selectedDate,
    storageKey,
  ])

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
    const deletedDates = readDateSetFromStorage(deletedDatesStorageKey)
    if (deletedDates.delete(selectedDate)) {
      writeDateSetToStorage(deletedDatesStorageKey, deletedDates)
    }
    showSuccessToast(`${title} saved`)
  }

  const handleOpenHistoryRecord = (date: string) => {
    setSelectedDate(date)
    setActiveView("schedule")
  }

  const handleEditHistoryRecord = (date: string) => {
    setSelectedDate(date)
    setActiveView("schedule")
  }

  const handleDeleteHistoryRecord = (date: string) => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(`Delete the ${title.toLowerCase()} record for ${formatDateToGb(date)}?`)

    if (!confirmed) return

    const nextLogs = { ...allLogs }
    delete nextLogs[date]
    setAllLogs(nextLogs)
    localStorage.setItem(storageKey, JSON.stringify(nextLogs))
    const deletedDates = readDateSetFromStorage(deletedDatesStorageKey)
    deletedDates.add(date)
    writeDateSetToStorage(deletedDatesStorageKey, deletedDates)

    if (selectedDate === date) {
      setRows(
        scheduleId === "light"
          ? normalizeLightScheduleRows(emptyRows)
          : emptyRows,
      )
    }

    showSuccessToast(`${title} record deleted`)
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Open actions menu"
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#8c7569] bg-white text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                          >
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <title>Actions</title>
                              <path d="M4 7h16" />
                              <path d="M4 12h16" />
                              <path d="M4 17h16" />
                            </svg>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenHistoryRecord(date)}
                          >
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEditHistoryRecord(date)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDeleteHistoryRecord(date)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

function CleanerSummary({ invoiceTrigger = 0 }: { invoiceTrigger?: number }) {
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
    queryFn: () => apiCall("/api/v1/acess/", { skip: 0, limit: 1000 }),
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings", "cleaner-summary"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const acesses = (acessData?.data || []) as AcessRecord[]
  const buildings = (buildingsData?.data || []) as Building[]
  const [editingCleanerRecord, setEditingCleanerRecord] =
    useState<CleanerRecordEditState | null>(null)
  const [cleanerManualAction, setCleanerManualAction] =
    useState<CleanerManualActionState | null>(null)
  const [editedCleanerInTimeValue, setEditedCleanerInTimeValue] = useState("")
  const [editedCleanerOutTimeValue, setEditedCleanerOutTimeValue] = useState("")
  const [cleanerManualTimeValue, setCleanerManualTimeValue] = useState("")
  const [isSavingCleanerRecordEdit, setIsSavingCleanerRecordEdit] =
    useState(false)
  const [isSavingCleanerManualAction, setIsSavingCleanerManualAction] =
    useState(false)
  const [deletingCleanerRowKey, setDeletingCleanerRowKey] = useState<
    string | null
  >(null)
  const [cleanerSearch, setCleanerSearch] = useState("")
  const [cleanerBuildingFilter, setCleanerBuildingFilter] = useState("")
  const [cleanerUsedFilterType, setCleanerUsedFilterType] = useState<
    "all" | "greater" | "less"
  >("all")
  const [cleanerUsedFilterValue, setCleanerUsedFilterValue] = useState("")
  const [cleanerHistoryPage, setCleanerHistoryPage] = useState(0)
  const [selectedCleanerDateFrom, setSelectedCleanerDateFrom] = useState("")
  const [selectedCleanerDateTo, setSelectedCleanerDateTo] = useState("")
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false)
  const [cleanerInvoiceHourEntries, setCleanerInvoiceHourEntries] = useState<
    WorkerInvoiceHourEntry[]
  >(() => readInvoiceHoursFromStorage(CLEANER_INVOICE_HOURS_STORAGE_KEY))
  const cleanerDeferredSearch = useDeferredValue(cleanerSearch.trim())
  const cleanerHistoryPageSize = 10

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

  const activeCleanerName = useMemo(() => {
    const cleaners = (cleanersData?.data || []).filter(
      (funcionario: Funcionario) => funcionario.cargo === 0,
    )
    return (
      cleaners.find((cleaner: Funcionario) => cleaner.is_default)?.nome ||
      "Cleaner"
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

  const cleanerBuildingOptions = useMemo(
    () =>
      [...new Set(enrichedSessions.map((session) => session.buildingLabel))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [enrichedSessions],
  )

  const filteredCleanerSessions = useMemo(() => {
    const normalizedSearch = cleanerDeferredSearch.toLowerCase()
    const usedHoursFilter = Number(cleanerUsedFilterValue)

    return enrichedSessions.filter((session) => {
      const dateValue = session.inRecord?.data || session.outRecord?.data || null
      const usedLabel = formatUsed(session.inRecord?.data, session.outRecord?.data)
      const matchesSearch =
        !normalizedSearch ||
        [
          session.buildingLabel,
          formatDate(dateValue),
          formatTime(session.inRecord?.data),
          formatTime(session.outRecord?.data),
          usedLabel,
        ].some((value) => value.toLowerCase().includes(normalizedSearch))

      if (!matchesSearch) return false
      if (
        cleanerBuildingFilter &&
        session.buildingLabel !== cleanerBuildingFilter
      ) {
        return false
      }

      if (
        cleanerUsedFilterType !== "all" &&
        cleanerUsedFilterValue.trim() &&
        !Number.isNaN(usedHoursFilter)
      ) {
        const usedHours = session.durationMinutes / 60
        if (
          cleanerUsedFilterType === "greater" &&
          !(usedHours > usedHoursFilter)
        ) {
          return false
        }
        if (
          cleanerUsedFilterType === "less" &&
          !(usedHours < usedHoursFilter)
        ) {
          return false
        }
      }

      return true
    })
  }, [
    cleanerBuildingFilter,
    cleanerDeferredSearch,
    cleanerUsedFilterType,
    cleanerUsedFilterValue,
    enrichedSessions,
  ])

  const totalCleanerHistoryPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(filteredCleanerSessions.length / cleanerHistoryPageSize),
      ),
    [filteredCleanerSessions.length],
  )

  const visibleCleanerSessions = useMemo(() => {
    const start = cleanerHistoryPage * cleanerHistoryPageSize
    return filteredCleanerSessions.slice(
      start,
      start + cleanerHistoryPageSize,
    )
  }, [cleanerHistoryPage, filteredCleanerSessions])

  useEffect(() => {
    setCleanerHistoryPage(0)
  }, [
    cleanerDeferredSearch,
    cleanerBuildingFilter,
    cleanerUsedFilterType,
    cleanerUsedFilterValue,
  ])

  useEffect(() => {
    setCleanerHistoryPage((currentPage) =>
      Math.min(currentPage, Math.max(0, totalCleanerHistoryPages - 1)),
    )
  }, [totalCleanerHistoryPages])

  const cleanerHistoryRangeStart =
    filteredCleanerSessions.length > 0
      ? cleanerHistoryPage * cleanerHistoryPageSize + 1
      : 0
  const cleanerHistoryRangeEnd = Math.min(
    (cleanerHistoryPage + 1) * cleanerHistoryPageSize,
    filteredCleanerSessions.length,
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

  const currentCleanerMonthKey = getCurrentMonthInputValue()
  const cleanerInvoiceHours = useMemo(
    () =>
      cleanerInvoiceHourEntries
        .filter((entry) => entry.monthKey === currentCleanerMonthKey)
        .reduce((sum, entry) => sum + entry.hours, 0),
    [cleanerInvoiceHourEntries, currentCleanerMonthKey],
  )

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

  const handleDeleteCleanerHistoryRow = async ({
    rowKey,
    inRecordId,
    outRecordId,
    buildingLabel,
    dateValue,
  }: {
    rowKey: string
    inRecordId: EntityId | null
    outRecordId: EntityId | null
    buildingLabel: string
    dateValue: string | null
  }) => {
    const recordIds = [inRecordId, outRecordId].filter(
      (value): value is EntityId => Boolean(value),
    )
    if (recordIds.length === 0) return

    const dateLabel = formatDate(dateValue)
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete the cleaner record for ${buildingLabel} on ${dateLabel}?`,
          )

    if (!confirmed) return

    try {
      setDeletingCleanerRowKey(rowKey)
      for (const recordId of recordIds) {
        await apiCall(`/api/v1/acess/${recordId}`, {
          method: "DELETE",
        })
      }
      await queryClient.invalidateQueries({
        queryKey: ["acess", "cleaner"],
      })
      showSuccessToast("Cleaner record deleted successfully")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete cleaner record"
      showErrorToast(message)
    } finally {
      setDeletingCleanerRowKey(null)
    }
  }

  const resetCleanerManualAction = () => {
    setCleanerManualAction(null)
    setCleanerManualTimeValue("")
  }

  const handleCleanerManualActionDialogChange = (open: boolean) => {
    if (!open && !isSavingCleanerManualAction) {
      resetCleanerManualAction()
    }
  }

  const handleOpenCleanerManualAction = (
    session: {
      inRecord?: AcessRecord
      outRecord?: AcessRecord
      buildingLabel: string
    },
    mode: CleanerManualActionState["mode"],
  ) => {
    const referenceRecord =
      mode === "checkin" ? session.outRecord : session.inRecord

    if (!referenceRecord?.building_id || !referenceRecord.data) {
      showErrorToast("Could not identify the record date")
      return
    }

    setCleanerManualAction({
      mode,
      buildingId: referenceRecord.building_id,
      buildingLabel: session.buildingLabel,
      referenceIso: referenceRecord.data,
    })
    setCleanerManualTimeValue("")
  }

  const handleSaveCleanerManualAction = async () => {
    if (!cleanerManualAction) return

    if (!cleanerManualTimeValue) {
      showErrorToast("Time is required")
      return
    }

    const [hoursRaw, minutesRaw] = cleanerManualTimeValue.split(":")
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

    const referenceDate = new Date(cleanerManualAction.referenceIso)
    if (Number.isNaN(referenceDate.getTime())) {
      showErrorToast("Invalid record date")
      return
    }

    const nextActionDate = new Date(referenceDate)
    nextActionDate.setHours(hours, minutes, 0, 0)

    if (cleanerManualAction.mode === "checkin") {
      if (nextActionDate.getTime() >= referenceDate.getTime()) {
        showErrorToast("Check in must be before Time OUT")
        return
      }
    } else if (nextActionDate.getTime() <= referenceDate.getTime()) {
      showErrorToast("Check out must be after Time IN")
      return
    }

    try {
      setIsSavingCleanerManualAction(true)
      await apiCall("/api/v1/acess/", {
        method: "POST",
        body: {
          building_id: cleanerManualAction.buildingId,
          operacao: cleanerManualAction.mode === "checkin" ? 0 : 1,
          data: nextActionDate.toISOString(),
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ["acess", "cleaner"],
      })
      resetCleanerManualAction()
      showSuccessToast(
        `Cleaner ${
          cleanerManualAction.mode === "checkin" ? "check in" : "check out"
        } created successfully`,
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create cleaner action"
      showErrorToast(message)
    } finally {
      setIsSavingCleanerManualAction(false)
    }
  }

  useEffect(() => {
    if (invoiceTrigger > 0) {
      setIsInvoiceDialogOpen(true)
    }
  }, [invoiceTrigger])

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
        <span className="rounded-full bg-[#eef8f2] px-3 py-1 text-xs font-semibold text-[#217a4b]">
          Invoices launched {formatInvoiceHours(cleanerInvoiceHours)}
        </span>
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

      <div className="mb-4 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label
              htmlFor="cleaner-history-search"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Search
            </label>
            <input
              id="cleaner-history-search"
              type="text"
              value={cleanerSearch}
              onChange={(event) => setCleanerSearch(event.target.value)}
              placeholder="Date, building, time or used"
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>
          <div>
            <label
              htmlFor="cleaner-history-building-filter"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Building
            </label>
            <select
              id="cleaner-history-building-filter"
              value={cleanerBuildingFilter}
              onChange={(event) => setCleanerBuildingFilter(event.target.value)}
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="">All buildings</option>
              {cleanerBuildingOptions.map((building) => (
                <option key={building} value={building}>
                  {building}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="cleaner-history-used-filter-type"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Used filter
            </label>
            <select
              id="cleaner-history-used-filter-type"
              value={cleanerUsedFilterType}
              onChange={(event) =>
                setCleanerUsedFilterType(
                  event.target.value === "greater"
                    ? "greater"
                    : event.target.value === "less"
                      ? "less"
                      : "all",
                )
              }
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="all">All</option>
              <option value="greater">Greater than</option>
              <option value="less">Less than</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="cleaner-history-used-filter-value"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Used hours
            </label>
            <input
              id="cleaner-history-used-filter-value"
              type="number"
              min="0"
              step="0.25"
              value={cleanerUsedFilterValue}
              onChange={(event) => setCleanerUsedFilterValue(event.target.value)}
              placeholder="e.g. 2"
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>
        </div>
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
            {!isLoadingAcess && visibleCleanerSessions.length === 0 && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={6}
                >
                  No records found.
                </td>
              </tr>
            )}
            {visibleCleanerSessions.map((session, index) => {
              const rowKey = `${session.inRecord?.id || "in"}-${session.outRecord?.id || "out"}-${index}`
              const dateLabel = formatDate(
                session.inRecord?.data || session.outRecord?.data,
              )
              const hasAnyRecord = Boolean(
                session.inRecord?.id || session.outRecord?.id,
              )
              const canCheckOut = Boolean(
                session.inRecord?.id && !session.outRecord?.id,
              )
              const canCheckIn = Boolean(
                !session.inRecord?.id && session.outRecord?.id,
              )

              return (
                <tr
                  key={rowKey}
                  className="bg-white hover:bg-gray-50"
                >
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {dateLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {session.buildingLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      {session.inRecord?.data ? (
                        <span>{formatTime(session.inRecord?.data)}</span>
                      ) : null}
                      {canCheckIn && (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCleanerManualAction(session, "checkin")
                          }
                          className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Check in
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      {session.outRecord?.data ? (
                        <span>{formatTime(session.outRecord?.data)}</span>
                      ) : null}
                      {canCheckOut && (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCleanerManualAction(session, "checkout")
                          }
                          className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Check out
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatUsed(
                      session.inRecord?.data,
                      session.outRecord?.data,
                    )}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Open actions menu"
                          disabled={!hasAnyRecord || deletingCleanerRowKey === rowKey}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#8c7569] bg-white text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <title>Actions</title>
                            <path d="M4 7h16" />
                            <path d="M4 12h16" />
                            <path d="M4 17h16" />
                          </svg>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={!hasAnyRecord || deletingCleanerRowKey === rowKey}
                          onClick={() =>
                            handleOpenCleanerRecordEdit(
                              session.inRecord?.id || null,
                              session.inRecord?.data || null,
                              session.outRecord?.id || null,
                              session.outRecord?.data || null,
                            )
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!hasAnyRecord || deletingCleanerRowKey === rowKey}
                          variant="destructive"
                          onClick={() =>
                            handleDeleteCleanerHistoryRow({
                              rowKey,
                              inRecordId: session.inRecord?.id || null,
                              outRecordId: session.outRecord?.id || null,
                              buildingLabel: session.buildingLabel,
                              dateValue:
                                session.inRecord?.data || session.outRecord?.data || null,
                            })
                          }
                        >
                          {deletingCleanerRowKey === rowKey ? "Deleting..." : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredCleanerSessions.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#55311c]">
            Showing {cleanerHistoryRangeStart}-{cleanerHistoryRangeEnd} of{" "}
            {filteredCleanerSessions.length} cleaner record(s)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setCleanerHistoryPage(Math.max(0, cleanerHistoryPage - 1))
              }
              disabled={cleanerHistoryPage === 0}
              className="rounded border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="flex items-center px-2 text-sm font-semibold text-[#55311c]">
              {cleanerHistoryPage + 1} / {totalCleanerHistoryPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCleanerHistoryPage(
                  Math.min(totalCleanerHistoryPages - 1, cleanerHistoryPage + 1),
                )
              }
              disabled={cleanerHistoryPage >= totalCleanerHistoryPages - 1}
              className="rounded border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

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

      <Dialog
        open={Boolean(cleanerManualAction)}
        onOpenChange={handleCleanerManualActionDialogChange}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              {cleanerManualAction?.mode === "checkin"
                ? "Create cleaner check in"
                : "Create cleaner check out"}
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Enter the time for{" "}
              {cleanerManualAction
                ? formatDate(cleanerManualAction.referenceIso)
                : "-"}{" "}
              at{" "}
              <span className="font-semibold text-[#55311c]">
                {cleanerManualAction?.buildingLabel || "-"}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c]"
                htmlFor="cleaner-manual-time"
              >
                Time
              </label>
              <input
                id="cleaner-manual-time"
                type="time"
                value={cleanerManualTimeValue}
                onChange={(event) =>
                  setCleanerManualTimeValue(event.target.value)
                }
                className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            {cleanerManualAction && (
              <p className="text-xs text-[rgba(0,0,0,0.65)]">
                {cleanerManualAction.mode === "checkin"
                  ? `Time IN must be before ${formatTime(
                      cleanerManualAction.referenceIso,
                    )}.`
                  : `Time OUT must be after ${formatTime(
                      cleanerManualAction.referenceIso,
                    )}.`}
              </p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={resetCleanerManualAction}
              disabled={isSavingCleanerManualAction}
              className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCleanerManualAction}
              disabled={isSavingCleanerManualAction}
              className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isSavingCleanerManualAction ? "Saving..." : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HoursInvoiceLauncherDialog
        open={isInvoiceDialogOpen}
        onOpenChange={setIsInvoiceDialogOpen}
        workerLabel="Cleaner"
        workerName={activeCleanerName}
        descriptionSubject="Cleaner"
        storageKey={CLEANER_INVOICE_HOURS_STORAGE_KEY}
        onLaunched={setCleanerInvoiceHourEntries}
      />
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
  invoiceTrigger = 0,
}: {
  activeTab: "summary" | "bins"
  reportTrigger?: number
  invoiceTrigger?: number
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
  const {
    data: monthlyGoalsData,
    isLoading: isLoadingMonthlyGoals,
    error: monthlyGoalsError,
  } = useQuery<ApiListResponse<CaretakerMonthlyGoalRecord>>({
    queryKey: ["acess", "caretaker", "work-time", "goals"],
    queryFn: () => apiCall("/api/v1/acess/caretaker/work-time/goals"),
  })
  const {
    data: monthlyMetricsData,
    isLoading: isLoadingMonthlyMetrics,
    error: monthlyMetricsError,
  } = useQuery<ApiListResponse<CaretakerMonthlyMetricRecord>>({
    queryKey: ["acess", "caretaker", "work-time", "monthly-metrics"],
    queryFn: () => apiCall("/api/v1/acess/caretaker/work-time/monthly-metrics"),
  })

  const workTimeRecordsRaw = (workTimeData?.data ||
    []) as WorkTimeSessionRecord[]
  const binSessionsRaw = (binSessionsData?.data || []) as BinSessionRecord[]
  const buildings = (buildingsData?.data || []) as Building[]
  const monthlyGoals = (monthlyGoalsData?.data ||
    []) as CaretakerMonthlyGoalRecord[]
  const monthlyMetrics = (monthlyMetricsData?.data ||
    []) as CaretakerMonthlyMetricRecord[]

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
  const [caretakerSearch, setCaretakerSearch] = useState("")
  const [caretakerBuildingFilter, setCaretakerBuildingFilter] = useState("")
  const [caretakerUsedFilterType, setCaretakerUsedFilterType] = useState<
    "all" | "greater" | "less"
  >("all")
  const [caretakerUsedFilterValue, setCaretakerUsedFilterValue] = useState("")
  const [caretakerHistoryPage, setCaretakerHistoryPage] = useState(0)
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    getWeekStartIso(new Date()),
  )
  const [reportDateFrom, setReportDateFrom] = useState("")
  const [reportDateTo, setReportDateTo] = useState("")
  const [reportEmail, setReportEmail] = useState("")
  const [isSendingReport, setIsSendingReport] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceHours, setInvoiceHours] = useState("")
  const [invoiceAmount, setInvoiceAmount] = useState("")
  const [includeCaretakerInvoiceTable, setIncludeCaretakerInvoiceTable] =
    useState(true)
  const [invoiceMediaName, setInvoiceMediaName] = useState("")
  const [invoiceMediaData, setInvoiceMediaData] = useState<string | null>(null)
  const [invoicePdfDataUrl, setInvoicePdfDataUrl] = useState("")
  const [invoicePdfFileName, setInvoicePdfFileName] = useState("")
  const [isGeneratingInvoicePdf, setIsGeneratingInvoicePdf] = useState(false)
  const [isLaunchingCaretakerInvoice, setIsLaunchingCaretakerInvoice] =
    useState(false)
  const [currentInvoiceHourEntryId, setCurrentInvoiceHourEntryId] = useState<
    string | null
  >(null)
  const [caretakerInvoiceHourEntries, setCaretakerInvoiceHourEntries] =
    useState<WorkerInvoiceHourEntry[]>(() =>
      readInvoiceHoursFromStorage(CARETAKER_INVOICE_HOURS_STORAGE_KEY),
    )
  const [deletingBinsRowKey, setDeletingBinsRowKey] = useState<string | null>(
    null,
  )
  const [editingCaretakerRecord, setEditingCaretakerRecord] =
    useState<CaretakerRecordEditState | null>(null)
  const [editedCaretakerTimeValue, setEditedCaretakerTimeValue] = useState("")
  const [editedCaretakerInTimeValue, setEditedCaretakerInTimeValue] =
    useState("")
  const [editedCaretakerOutTimeValue, setEditedCaretakerOutTimeValue] =
    useState("")
  const [isSavingCaretakerRecordEdit, setIsSavingCaretakerRecordEdit] =
    useState(false)
  const [
    isConfirmingCaretakerRecordDelete,
    setIsConfirmingCaretakerRecordDelete,
  ] = useState(false)
  const [showMonthlyGoalsModal, setShowMonthlyGoalsModal] = useState(false)
  const [goalFormMonth, setGoalFormMonth] = useState("")
  const [goalFormHours, setGoalFormHours] = useState("")
  const [editingMonthlyGoal, setEditingMonthlyGoal] =
    useState<CaretakerMonthlyGoalRecord | null>(null)
  const [deletingMonthlyGoalId, setDeletingMonthlyGoalId] =
    useState<EntityId | null>(null)
  const [caretakerManualAction, setCaretakerManualAction] =
    useState<CaretakerManualActionState | null>(null)
  const [caretakerManualTimeValue, setCaretakerManualTimeValue] = useState("")
  const [isSavingCaretakerManualAction, setIsSavingCaretakerManualAction] =
    useState(false)
  const caretakerDeferredSearch = useDeferredValue(caretakerSearch.trim())
  const caretakerHistoryPageSize = 10

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

  const formatDecimalHours = (hoursValue: number) => {
    if (!Number.isFinite(hoursValue)) return "0m"
    const totalMinutes = Math.round(hoursValue * 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) return `${minutes}m`
    if (minutes === 0) return `${hours}h`
    return `${hours}h ${minutes}m`
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
  const selectedWorkMonthKey = useMemo(
    () => selectedWeekStart.slice(0, 7),
    [selectedWeekStart],
  )
  const selectedWorkMonthLabel = useMemo(() => {
    const [yearRaw, monthRaw] = selectedWorkMonthKey.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    if (!year || !month) return selectedWorkMonthKey
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  }, [selectedWorkMonthKey])
  const monthlyMetricsByMonthKey = useMemo(
    () =>
      new Map(
        monthlyMetrics.map((metric) => [metric.month_start.slice(0, 7), metric]),
      ),
    [monthlyMetrics],
  )
  const selectedWorkMonthMetric =
    monthlyMetricsByMonthKey.get(selectedWorkMonthKey) || null
  const selectedWorkMonthHours = selectedWorkMonthMetric?.worked_hours || 0
  const selectedWorkMonthTargetHours =
    selectedWorkMonthMetric?.target_hours || 0
  const selectedWorkMonthEffectiveTargetHours =
    selectedWorkMonthMetric?.effective_target_hours || 0
  const selectedWorkMonthRemainingHours =
    selectedWorkMonthMetric?.remaining_hours || 0
  const selectedWorkMonthInvoiceHours = useMemo(
    () =>
      caretakerInvoiceHourEntries
        .filter((entry) => entry.monthKey === selectedWorkMonthKey)
        .reduce((sum, entry) => sum + entry.hours, 0),
    [caretakerInvoiceHourEntries, selectedWorkMonthKey],
  )

  const resetMonthlyGoalForm = () => {
    setEditingMonthlyGoal(null)
    setGoalFormMonth(selectedWorkMonthKey)
    setGoalFormHours("")
  }

  const handleOpenMonthlyGoalsModal = () => {
    resetMonthlyGoalForm()
    setShowMonthlyGoalsModal(true)
  }

  const handleEditMonthlyGoal = (goal: CaretakerMonthlyGoalRecord) => {
    setEditingMonthlyGoal(goal)
    setGoalFormMonth(goal.month_start.slice(0, 7))
    setGoalFormHours(String(goal.target_hours))
  }

  const saveMonthlyGoalMutation = useMutation({
    mutationFn: async ({
      goalId,
      month,
      targetHours,
    }: {
      goalId?: EntityId
      month: string
      targetHours: number
    }) =>
      goalId
        ? apiCall(`/api/v1/acess/caretaker/work-time/goals/${goalId}`, {
            method: "PATCH",
            body: {
              month_start: `${month}-01`,
              target_hours: targetHours,
            },
          })
        : apiCall("/api/v1/acess/caretaker/work-time/goals", {
            method: "POST",
            body: {
              month_start: `${month}-01`,
              target_hours: targetHours,
            },
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["acess", "caretaker", "work-time", "goals"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["acess", "caretaker", "work-time", "monthly-metrics"],
      })
      showSuccessToast(
        editingMonthlyGoal
          ? "Monthly goal updated successfully"
          : "Monthly goal created successfully",
      )
      resetMonthlyGoalForm()
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to save monthly goal"
      showErrorToast(message)
    },
  })

  const handleSaveMonthlyGoal = () => {
    if (!goalFormMonth) {
      showErrorToast("Month is required")
      return
    }

    const parsedHours = Number(goalFormHours)
    if (Number.isNaN(parsedHours) || parsedHours < 0) {
      showErrorToast("Invalid target hours")
      return
    }

    saveMonthlyGoalMutation.mutate({
      goalId: editingMonthlyGoal?.id,
      month: goalFormMonth,
      targetHours: parsedHours,
    })
  }

  const handleDeleteMonthlyGoal = async (goal: CaretakerMonthlyGoalRecord) => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete the monthly goal for ${new Date(`${goal.month_start}T00:00:00Z`).toLocaleDateString(
              "en-GB",
              {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              },
            )}?`,
          )

    if (!confirmed) return

    try {
      setDeletingMonthlyGoalId(goal.id)
      await apiCall(`/api/v1/acess/caretaker/work-time/goals/${goal.id}`, {
        method: "DELETE",
      })
      await queryClient.invalidateQueries({
        queryKey: ["acess", "caretaker", "work-time", "goals"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["acess", "caretaker", "work-time", "monthly-metrics"],
      })
      if (editingMonthlyGoal?.id === goal.id) {
        resetMonthlyGoalForm()
      }
      showSuccessToast("Monthly goal deleted successfully")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete monthly goal"
      showErrorToast(message)
    } finally {
      setDeletingMonthlyGoalId(null)
    }
  }

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

  const workTimeChartData = useMemo(
    () => [
      { label: "Worktime day", hours: workTimeDayHours },
      { label: "Worktime week", hours: workTimeWeekHours },
      { label: "Worktime monthly", hours: selectedWorkMonthHours },
    ],
    [selectedWorkMonthHours, workTimeDayHours, workTimeWeekHours],
  )

  const hasWorkTimeChartData = useMemo(
    () => workTimeChartData.some((item) => item.hours > 0),
    [workTimeChartData],
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
    const rows = [...totals.entries()]
      .map(([building, minutes]) => ({
        building,
        hours: Number((minutes / 60).toFixed(2)),
      }))
      .sort((a, b) => b.hours - a.hours)
    const totalHours = rows.reduce((sum, row) => sum + row.hours, 0)
    return totalHours > 0
      ? [...rows, { building: "Total", hours: Number(totalHours.toFixed(2)) }]
      : rows
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
        buildingId: buildingId || null,
        inValue: session.inRecord?.data || null,
        outValue: session.outRecord?.data || null,
        inRecordId: session.inRecord?.id || null,
        outRecordId: session.outRecord?.id || null,
        durationMinutes: getDurationMinutes(
          session.inRecord?.data,
          session.outRecord?.data,
          true,
        ),
        sortTime,
      }
    })
  }, [binSessionsGrouped, buildingMap, getDurationMinutes])

  const workTimeHistoryRows = useMemo(() => {
    return workTimeSessionsGrouped.map((session, index) => {
      const dateValue =
        session.inRecord?.data || session.outRecord?.data || null
      const sortTime = dateValue ? new Date(dateValue).getTime() : 0
      return {
        key: `work-time-${index}-${session.inRecord?.id || "in"}-${session.outRecord?.id || "out"}`,
        kind: "work-time" as const,
        buildingLabel: "WORK TIME",
        buildingId: null,
        inValue: session.inRecord?.data || null,
        outValue: session.outRecord?.data || null,
        inRecordId: session.inRecord?.id || null,
        outRecordId: session.outRecord?.id || null,
        durationMinutes: getDurationMinutes(
          session.inRecord?.data,
          session.outRecord?.data,
          false,
        ),
        sortTime,
      }
    })
  }, [getDurationMinutes, workTimeSessionsGrouped])

  const filteredHistoryRows = useMemo(() => {
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
        : sourceRows.filter((row) =>
            isDateWithinRange(
              toDateKey(row.inValue || row.outValue),
              binsDateFrom,
              binsDateTo,
            ),
          )
    return [...filteredRows].sort((a, b) => b.sortTime - a.sortTime)
  }, [
    activeTab,
    binHistoryRows,
    binsDateFrom,
    binsDateTo,
    selectedWeekStart,
    toDateKey,
    workTimeHistoryRows,
  ])

  const caretakerBuildingOptions = useMemo(
    () =>
      [...new Set(filteredHistoryRows.map((row) => row.buildingLabel))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [filteredHistoryRows],
  )

  const filteredCaretakerHistoryRows = useMemo(() => {
    const normalizedSearch = caretakerDeferredSearch.toLowerCase()
    const usedHoursFilter = Number(caretakerUsedFilterValue)

    return filteredHistoryRows.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          row.buildingLabel,
          formatDate(row.inValue || row.outValue),
          formatTime(row.inValue),
          formatTime(row.outValue),
          formatUsed(row.inValue, row.outValue),
        ].some((value) => value.toLowerCase().includes(normalizedSearch))

      if (!matchesSearch) return false
      if (
        caretakerBuildingFilter &&
        row.buildingLabel !== caretakerBuildingFilter
      ) {
        return false
      }
      if (
        caretakerUsedFilterType !== "all" &&
        caretakerUsedFilterValue.trim() &&
        !Number.isNaN(usedHoursFilter)
      ) {
        const usedHours = row.durationMinutes / 60
        if (
          caretakerUsedFilterType === "greater" &&
          !(usedHours > usedHoursFilter)
        ) {
          return false
        }
        if (
          caretakerUsedFilterType === "less" &&
          !(usedHours < usedHoursFilter)
        ) {
          return false
        }
      }
      return true
    })
  }, [
    caretakerBuildingFilter,
    caretakerDeferredSearch,
    caretakerUsedFilterType,
    caretakerUsedFilterValue,
    filteredHistoryRows,
  ])

  const totalCaretakerHistoryPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(filteredCaretakerHistoryRows.length / caretakerHistoryPageSize),
      ),
    [filteredCaretakerHistoryRows.length],
  )

  const visibleHistoryRows = useMemo(() => {
    const start = caretakerHistoryPage * caretakerHistoryPageSize
    return filteredCaretakerHistoryRows.slice(
      start,
      start + caretakerHistoryPageSize,
    )
  }, [
    caretakerHistoryPage,
    filteredCaretakerHistoryRows,
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

  useEffect(() => {
    setCaretakerHistoryPage(0)
  }, [
    activeTab,
    caretakerDeferredSearch,
    caretakerBuildingFilter,
    caretakerUsedFilterType,
    caretakerUsedFilterValue,
    selectedWeekStart,
    binsDateFrom,
    binsDateTo,
  ])

  useEffect(() => {
    setCaretakerHistoryPage((currentPage) =>
      Math.min(currentPage, Math.max(0, totalCaretakerHistoryPages - 1)),
    )
  }, [totalCaretakerHistoryPages])

  const caretakerHistoryRangeStart =
    filteredCaretakerHistoryRows.length > 0
      ? caretakerHistoryPage * caretakerHistoryPageSize + 1
      : 0
  const caretakerHistoryRangeEnd = Math.min(
    (caretakerHistoryPage + 1) * caretakerHistoryPageSize,
    filteredCaretakerHistoryRows.length,
  )

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

  const resetCaretakerInvoiceForm = () => {
    setInvoiceHours("")
    setInvoiceAmount("")
    setIncludeCaretakerInvoiceTable(true)
    setInvoiceMediaName("")
    setInvoiceMediaData(null)
    setInvoicePdfDataUrl("")
    setInvoicePdfFileName("")
    setCurrentInvoiceHourEntryId(null)
  }

  const handleCaretakerInvoiceFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setInvoiceMediaName(file.name)
      setInvoiceMediaData(dataUrl)
      setInvoicePdfDataUrl("")
      setInvoicePdfFileName("")
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not read invoice media",
      )
    } finally {
      event.target.value = ""
    }
  }

  const generateCaretakerInvoicePdf = async ({
    showToast = true,
  }: { showToast?: boolean } = {}) => {
    const parsedHours = Number(invoiceHours)
    if (!invoiceHours.trim() || !Number.isFinite(parsedHours) || parsedHours <= 0) {
      if (showToast) showErrorToast("Total hours must be a valid number")
      return
    }

    setIsGeneratingInvoicePdf(true)
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 44
      const invoiceDate = new Date().toLocaleDateString("en-GB")
      const fileName = `caretaker-hours-invoice-${new Date().toISOString().slice(0, 10)}.pdf`
      const parsedAmount = Number(invoiceAmount)
      const hasAmount = invoiceAmount.trim() && Number.isFinite(parsedAmount)

      doc.setFontSize(18)
      doc.text("Caretaker Hours Payment Invoice", margin, 48)
      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, margin, 68)

      const invoiceSummaryRows = [
        ["Invoice date", invoiceDate],
        ["Caretaker", activeCaretakerName],
        ["Month", selectedWorkMonthLabel],
        ["Total hours", formatDecimalHours(parsedHours)],
        ["Amount", hasAmount ? formatCurrencyGbp(-Math.abs(parsedAmount)) : "-"],
        ["Attached media", invoiceMediaName || "None"],
      ]

      if (includeCaretakerInvoiceTable) {
        autoTable(doc, {
          startY: 100,
          head: [["Field", "Value"]],
          body: invoiceSummaryRows,
          theme: "grid",
          styles: {
            fontSize: 10,
            cellPadding: 7,
            lineColor: [180, 180, 180],
            lineWidth: 0.4,
          },
          headStyles: {
            fillColor: [140, 117, 105],
            textColor: 255,
            fontStyle: "bold",
          },
          columnStyles: {
            0: { fontStyle: "bold", cellWidth: 150 },
          },
        })
      } else {
        doc.setFontSize(11)
        invoiceSummaryRows.forEach(([label, value], index) => {
          doc.text(`${label}: ${value}`, margin, 104 + index * 22, {
            maxWidth: pageWidth - margin * 2,
          })
        })
      }

      if (invoiceMediaData) {
        doc.addPage()
        doc.setFontSize(14)
        doc.text("Supporting media", margin, 44)
        doc.setFontSize(10)
        doc.text(invoiceMediaName || "Attached media", margin, 64, {
          maxWidth: pageWidth - margin * 2,
        })

        if (isImageDataUrl(invoiceMediaData)) {
          try {
            const image = new Image()
            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve()
              image.onerror = () => reject(new Error("Could not load invoice media"))
              image.src = invoiceMediaData
            })
            const maxWidth = pageWidth - margin * 2
            const maxHeight = pageHeight - 110
            const ratio = Math.min(
              maxWidth / Math.max(image.naturalWidth, 1),
              maxHeight / Math.max(image.naturalHeight, 1),
            )
            const width = image.naturalWidth * ratio
            const height = image.naturalHeight * ratio
            const x = margin + (maxWidth - width) / 2
            const imageFormat = invoiceMediaData.startsWith("data:image/png")
              ? "PNG"
              : "JPEG"
            doc.addImage(invoiceMediaData, imageFormat, x, 84, width, height)
          } catch {
            doc.text("The attached image could not be added to the PDF.", margin, 96)
          }
        } else if (isPdfDataUrl(invoiceMediaData)) {
          doc.text(
            "A PDF media file was attached. The generated invoice references the file, but browser-side PDF merging is not available.",
            margin,
            96,
            { maxWidth: pageWidth - margin * 2 },
          )
        } else {
          doc.text("Preview is not available for this media type.", margin, 96)
        }
      }

      const dataUrl = doc.output("datauristring")
      setInvoicePdfDataUrl(dataUrl)
      setInvoicePdfFileName(fileName)
      const hours = Number(parsedHours.toFixed(2))
      if (showToast) showSuccessToast("Invoice preview generated")
      return { dataUrl, fileName, hours }
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Could not generate invoice",
      )
    } finally {
      setIsGeneratingInvoicePdf(false)
    }
  }

  const handleLaunchCaretakerInvoice = async () => {
    const parsedAmount = Number(invoiceAmount)
    if (!invoiceAmount.trim() || !Number.isFinite(parsedAmount)) {
      showErrorToast("Amount must be a valid number")
      return
    }
    if (parsedAmount === 0) {
      showErrorToast("Amount must be different from zero")
      return
    }

    try {
      setIsLaunchingCaretakerInvoice(true)
      const generatedInvoice = await generateCaretakerInvoicePdf({
        showToast: false,
      })
      if (!generatedInvoice) return

      const amount = parsedAmount < 0 ? parsedAmount : -Math.abs(parsedAmount)
      const hoursLabel = Number(generatedInvoice.hours.toFixed(2)).toString()
      const entryId =
        currentInvoiceHourEntryId ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`

      await apiCall("/api/v1/cash-flow/", {
        method: "POST",
        body: {
          has_invoice: true,
          invoice_media_name: generatedInvoice.fileName,
          invoice_media_data: generatedInvoice.dataUrl,
          record_date: getTodayDateInputValue(),
          amount,
          description: `Caretaker ${hoursLabel} hours payment`,
        },
      })

      setCurrentInvoiceHourEntryId(entryId)
      setCaretakerInvoiceHourEntries((currentEntries) => {
        const nextEntries = [
          ...currentEntries.filter((entry) => entry.id !== entryId),
          {
            id: entryId,
            monthKey: selectedWorkMonthKey,
            hours: generatedInvoice.hours,
            workerName: activeCaretakerName,
            createdAt: new Date().toISOString(),
            fileName: generatedInvoice.fileName,
          },
        ]
        writeInvoiceHoursToStorage(
          CARETAKER_INVOICE_HOURS_STORAGE_KEY,
          nextEntries,
        )
        return nextEntries
      })
      queryClient.invalidateQueries({ queryKey: ["cash-flow"] })
      showSuccessToast("Caretaker invoice added to cash flow")
      setShowInvoiceModal(false)
      resetCaretakerInvoiceForm()
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Could not add caretaker invoice to cash flow",
      )
    } finally {
      setIsLaunchingCaretakerInvoice(false)
    }
  }

  const handleOpenCaretakerRecordEdit = (
    recordId: EntityId | null,
    isoValue: string | null,
    label: "Time IN" | "Time OUT",
    recordType: "work-time" | "bins",
    rowContext?: {
      rowKey: string
      buildingLabel: string
      dateValue: string | null
      inRecordId: EntityId | null
      inValue: string | null
      outRecordId: EntityId | null
      outValue: string | null
    },
  ) => {
    if (!recordId || !isoValue) return
    setEditingCaretakerRecord({
      recordId,
      originalIso: isoValue,
      label,
      recordType,
      rowKey: rowContext?.rowKey,
      buildingLabel: rowContext?.buildingLabel,
      dateValue: rowContext?.dateValue,
      inRecordId: rowContext?.inRecordId,
      inOriginalIso: rowContext?.inValue,
      outRecordId: rowContext?.outRecordId,
      outOriginalIso: rowContext?.outValue,
    })
    setEditedCaretakerTimeValue(toTimeInputValue(isoValue))
    setEditedCaretakerInTimeValue(toTimeInputValue(rowContext?.inValue))
    setEditedCaretakerOutTimeValue(toTimeInputValue(rowContext?.outValue))
    setIsConfirmingCaretakerRecordDelete(false)
  }

  const handleCaretakerEditCellKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    openEdit: () => void,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    openEdit()
  }

  const handleSaveCaretakerRecordEdit = async () => {
    if (!editingCaretakerRecord) return

    const isWorkTimeEdit = editingCaretakerRecord.recordType === "work-time"
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

      if (isWorkTimeEdit) {
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

        await apiCall(
          `/api/v1/acess/caretaker/work-time/${editingCaretakerRecord.recordId}`,
          {
            method: "PATCH",
            body: { data: nextDate.toISOString() },
          },
        )
      } else {
        const updates: Promise<unknown>[] = []

        if (
          editingCaretakerRecord.inRecordId &&
          editingCaretakerRecord.inOriginalIso
        ) {
          if (!editedCaretakerInTimeValue) {
            showErrorToast("Time IN is required")
            return
          }

          const [hoursRaw, minutesRaw] = editedCaretakerInTimeValue.split(":")
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

          const nextInDate = new Date(editingCaretakerRecord.inOriginalIso)
          if (Number.isNaN(nextInDate.getTime())) {
            showErrorToast("Invalid Time IN record date")
            return
          }
          nextInDate.setHours(hours, minutes, 0, 0)

          updates.push(
            apiCall(
              `/api/v1/bins/sessions/${editingCaretakerRecord.inRecordId}`,
              {
                method: "PATCH",
                body: { data: nextInDate.toISOString() },
              },
            ),
          )
        }

        if (
          editingCaretakerRecord.outRecordId &&
          editingCaretakerRecord.outOriginalIso
        ) {
          if (!editedCaretakerOutTimeValue) {
            showErrorToast("Time OUT is required")
            return
          }

          const [hoursRaw, minutesRaw] = editedCaretakerOutTimeValue.split(":")
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

          const nextOutDate = new Date(editingCaretakerRecord.outOriginalIso)
          if (Number.isNaN(nextOutDate.getTime())) {
            showErrorToast("Invalid Time OUT record date")
            return
          }
          nextOutDate.setHours(hours, minutes, 0, 0)

          updates.push(
            apiCall(
              `/api/v1/bins/sessions/${editingCaretakerRecord.outRecordId}`,
              {
                method: "PATCH",
                body: { data: nextOutDate.toISOString() },
              },
            ),
          )
        }

        if (updates.length === 0) {
          showErrorToast("No bin session records to update")
          return
        }

        await Promise.all(updates)
      }

      await queryClient.invalidateQueries({
        queryKey,
      })
      setEditingCaretakerRecord(null)
      setIsConfirmingCaretakerRecordDelete(false)
      showSuccessToast(successMessage)
    } catch (error) {
      const message = error instanceof Error ? error.message : errorFallback
      showErrorToast(message)
    } finally {
      setIsSavingCaretakerRecordEdit(false)
    }
  }

  const resetCaretakerManualAction = () => {
    setCaretakerManualAction(null)
    setCaretakerManualTimeValue("")
  }

  const handleCaretakerManualActionDialogChange = (open: boolean) => {
    if (!open && !isSavingCaretakerManualAction) {
      resetCaretakerManualAction()
    }
  }

  const handleOpenCaretakerManualAction = (
    row: {
      kind: "work-time" | "bins"
      buildingLabel: string
      buildingId: EntityId | null
      inValue: string | null
      outValue: string | null
    },
    mode: CaretakerManualActionState["mode"],
  ) => {
    const referenceIso = mode === "checkin" ? row.outValue : row.inValue
    if (!referenceIso) {
      showErrorToast("Could not identify the record date")
      return
    }

    setCaretakerManualAction({
      mode,
      recordType: row.kind,
      buildingId: row.kind === "bins" ? row.buildingId : null,
      buildingLabel: row.buildingLabel,
      referenceIso,
    })
    setCaretakerManualTimeValue("")
  }

  const handleSaveCaretakerManualAction = async () => {
    if (!caretakerManualAction) return

    if (!caretakerManualTimeValue) {
      showErrorToast("Time is required")
      return
    }

    const [hoursRaw, minutesRaw] = caretakerManualTimeValue.split(":")
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

    const referenceDate = new Date(caretakerManualAction.referenceIso)
    if (Number.isNaN(referenceDate.getTime())) {
      showErrorToast("Invalid record date")
      return
    }

    const nextActionDate = new Date(referenceDate)
    nextActionDate.setHours(hours, minutes, 0, 0)

    if (caretakerManualAction.mode === "checkin") {
      if (nextActionDate.getTime() >= referenceDate.getTime()) {
        showErrorToast("Check in must be before Time OUT")
        return
      }
    } else if (nextActionDate.getTime() <= referenceDate.getTime()) {
      showErrorToast("Check out must be after Time IN")
      return
    }

    const apiPath =
      caretakerManualAction.recordType === "work-time"
        ? "/api/v1/acess/caretaker/work-time"
        : "/api/v1/bins/sessions"
    const queryKey =
      caretakerManualAction.recordType === "work-time"
        ? ["acess", "caretaker", "work-time"]
        : ["bins", "sessions", "caretaker-summary"]

    if (
      caretakerManualAction.recordType === "bins" &&
      !caretakerManualAction.buildingId
    ) {
      showErrorToast("Could not identify building")
      return
    }

    try {
      setIsSavingCaretakerManualAction(true)
      await apiCall(apiPath, {
        method: "POST",
        body:
          caretakerManualAction.recordType === "work-time"
            ? {
                operacao: caretakerManualAction.mode === "checkin" ? 0 : 1,
                data: nextActionDate.toISOString(),
              }
            : {
                building_id: caretakerManualAction.buildingId,
                operacao: caretakerManualAction.mode === "checkin" ? 0 : 1,
                data: nextActionDate.toISOString(),
              },
      })
      await queryClient.invalidateQueries({
        queryKey,
      })
      resetCaretakerManualAction()
      showSuccessToast(
        `${caretakerManualAction.recordType === "work-time" ? "Caretaker" : "Bin"} ${
          caretakerManualAction.mode === "checkin" ? "check in" : "check out"
        } created successfully`,
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create caretaker action"
      showErrorToast(message)
    } finally {
      setIsSavingCaretakerManualAction(false)
    }
  }

  const handleDeleteBinsHistoryRow = async ({
    rowKey,
    inRecordId,
    outRecordId,
  }: {
    rowKey: string
    inRecordId: EntityId | null
    outRecordId: EntityId | null
  }): Promise<boolean> => {
    const recordIds = [inRecordId, outRecordId].filter(
      (value): value is EntityId => Boolean(value),
    )
    if (recordIds.length === 0) return false

    try {
      setDeletingBinsRowKey(rowKey)
      for (const recordId of recordIds) {
        await apiCall(`/api/v1/bins/sessions/${recordId}`, {
          method: "DELETE",
        })
      }
      await queryClient.invalidateQueries({
        queryKey: ["bins", "sessions", "caretaker-summary"],
      })
      showSuccessToast("Bin record deleted successfully")
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete bin record"
      showErrorToast(message)
      return false
    } finally {
      setDeletingBinsRowKey(null)
    }
  }

  const handleDeleteEditingCaretakerRecord = async () => {
    if (!editingCaretakerRecord || editingCaretakerRecord.recordType !== "bins")
      return

    if (!isConfirmingCaretakerRecordDelete) {
      setIsConfirmingCaretakerRecordDelete(true)
      return
    }

    if (!editingCaretakerRecord.rowKey) return

    const deleted = await handleDeleteBinsHistoryRow({
      rowKey: editingCaretakerRecord.rowKey,
      inRecordId: editingCaretakerRecord.inRecordId || null,
      outRecordId: editingCaretakerRecord.outRecordId || null,
    })

    if (deleted) {
      setEditingCaretakerRecord(null)
      setIsConfirmingCaretakerRecordDelete(false)
    }
  }

  useEffect(() => {
    if (reportTrigger > 0) {
      setShowReportModal(true)
    }
  }, [reportTrigger])

  useEffect(() => {
    if (invoiceTrigger > 0) {
      resetCaretakerInvoiceForm()
      setShowInvoiceModal(true)
    }
  }, [invoiceTrigger])

  useEffect(() => {
    if (!showInvoiceModal) return
    const parsedHours = Number(invoiceHours)
    if (!invoiceHours.trim() || !Number.isFinite(parsedHours) || parsedHours <= 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      generateCaretakerInvoicePdf({ showToast: false })
    }, 200)

    return () => window.clearTimeout(timeoutId)
  }, [
    showInvoiceModal,
    invoiceHours,
    invoiceAmount,
    includeCaretakerInvoiceTable,
    invoiceMediaData,
    invoiceMediaName,
    selectedWorkMonthKey,
    activeCaretakerName,
  ])

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
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="lg:pr-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]">
                  Weekly Hours
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <span className="font-['Nunito',sans-serif] text-4xl font-bold text-[#55311c]">
                    {formatDecimalHours(workTimeWeekHours)}
                  </span>
                  <span className="pb-1 text-sm text-[rgba(85,49,28,0.72)]">
                    {weekRangeLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[rgba(85,49,28,0.72)]">
                  {formatDecimalHours(remainingWeeklyTargetHours)} left to reach 20h
                </p>
              </div>
              <div className="lg:border-l lg:border-[#e5e0dc] lg:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]">
                      Monthly Hours
                    </p>
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <span className="font-['Nunito',sans-serif] text-4xl font-bold text-[#55311c]">
                        {formatDecimalHours(selectedWorkMonthHours)}
                      </span>
                      <span className="pb-1 text-sm text-[rgba(85,49,28,0.72)]">
                        {selectedWorkMonthLabel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenMonthlyGoalsModal}
                    className="rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                  >
                    Monthly goals
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-start gap-2 text-sm text-[rgba(85,49,28,0.78)]">
                  <span className="font-semibold text-[#55311c]">
                    Target {formatDecimalHours(selectedWorkMonthTargetHours)}
                  </span>
                  <span className="font-semibold text-[#217a4b]">
                    Invoices launched{" "}
                    {formatDecimalHours(selectedWorkMonthInvoiceHours)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[rgba(85,49,28,0.72)]">
                  {isLoadingMonthlyMetrics
                    ? "Loading monthly target..."
                    : monthlyMetricsError
                      ? "Failed to load monthly target."
                    : selectedWorkMonthEffectiveTargetHours > 0
                      ? `${formatDecimalHours(selectedWorkMonthRemainingHours)} left to reach ${formatDecimalHours(selectedWorkMonthEffectiveTargetHours)}`
                      : "No monthly goal defined for this month."}
                </p>
              </div>
              <div className="flex flex-col gap-2 lg:border-l lg:border-[#e5e0dc] lg:items-end lg:pl-6">
                <span className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]">
                  Week Filter
                </span>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                <BarChart data={workTimeChartData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9d0ca" />
                  <XAxis
                    type="category"
                    dataKey="label"
                    stroke="#55311c"
                    tick={{ fill: "#55311c", fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    stroke="#55311c"
                    tick={{ fill: "#55311c", fontSize: 12 }}
                    tickFormatter={(value: number) => formatDecimalHours(value)}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      formatDecimalHours(Number(value)),
                      "Hours",
                    ]}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e5e0dc",
                      backgroundColor: "#fff",
                    }}
                  />
                  <Bar
                    dataKey="hours"
                    fill="#8c7569"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={56}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!isLoadingWorkTime && !hasWorkTimeChartData && (
              <p className="mt-3 text-sm text-[rgba(0,0,0,0.6)]">
                No WORK TIME sessions in the selected day, week or month.
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

      <div className="mb-4 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label
              htmlFor="caretaker-history-search"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Search
            </label>
            <input
              id="caretaker-history-search"
              type="text"
              value={caretakerSearch}
              onChange={(event) => setCaretakerSearch(event.target.value)}
              placeholder="Date, building, time or used"
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>
          <div>
            <label
              htmlFor="caretaker-history-building-filter"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Building
            </label>
            <select
              id="caretaker-history-building-filter"
              value={caretakerBuildingFilter}
              onChange={(event) =>
                setCaretakerBuildingFilter(event.target.value)
              }
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="">All buildings</option>
              {caretakerBuildingOptions.map((building) => (
                <option key={building} value={building}>
                  {building}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="caretaker-history-used-filter-type"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Used filter
            </label>
            <select
              id="caretaker-history-used-filter-type"
              value={caretakerUsedFilterType}
              onChange={(event) =>
                setCaretakerUsedFilterType(
                  event.target.value === "greater"
                    ? "greater"
                    : event.target.value === "less"
                      ? "less"
                      : "all",
                )
              }
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="all">All</option>
              <option value="greater">Greater than</option>
              <option value="less">Less than</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="caretaker-history-used-filter-value"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Used hours
            </label>
            <input
              id="caretaker-history-used-filter-value"
              type="number"
              min="0"
              step="0.25"
              value={caretakerUsedFilterValue}
              onChange={(event) =>
                setCaretakerUsedFilterValue(event.target.value)
              }
              placeholder="e.g. 2"
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>
        </div>
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
              const canCheckIn = Boolean(!row.inValue && row.outValue)
              const canCheckOut = Boolean(row.inValue && !row.outValue)
              const canEditIn = Boolean(row.inValue && row.inRecordId)
              const canEditOut = Boolean(row.outValue && row.outRecordId)
              const rowEditContext = {
                rowKey: row.key,
                buildingLabel: row.buildingLabel,
                dateValue: row.inValue || row.outValue,
                inRecordId: row.inRecordId,
                inValue: row.inValue,
                outRecordId: row.outRecordId,
                outValue: row.outValue,
              }
              const openInEdit = () =>
                handleOpenCaretakerRecordEdit(
                  row.inRecordId,
                  row.inValue,
                  "Time IN",
                  row.kind,
                  row.kind === "bins" ? rowEditContext : undefined,
                )
              const openOutEdit = () =>
                handleOpenCaretakerRecordEdit(
                  row.outRecordId,
                  row.outValue,
                  "Time OUT",
                  row.kind,
                  row.kind === "bins" ? rowEditContext : undefined,
                )
              const canEditBinsRow =
                activeTab === "bins" &&
                row.kind === "bins" &&
                (canEditIn || canEditOut)
              const openBinsRowEdit = () => {
                if (!canEditBinsRow) return
                if (row.inRecordId && row.inValue) {
                  handleOpenCaretakerRecordEdit(
                    row.inRecordId,
                    row.inValue,
                    "Time IN",
                    row.kind,
                    rowEditContext,
                  )
                  return
                }
                handleOpenCaretakerRecordEdit(
                  row.outRecordId,
                  row.outValue,
                  "Time OUT",
                  row.kind,
                  rowEditContext,
                )
              }

              return (
                <tr
                  key={row.key}
                  className={`bg-white hover:bg-gray-50 ${
                    canEditBinsRow ? "cursor-pointer" : ""
                  }`}
                  onClick={canEditBinsRow ? openBinsRowEdit : undefined}
                  onKeyDown={
                    canEditBinsRow
                      ? (event) =>
                          handleCaretakerEditCellKeyDown(event, openBinsRowEdit)
                      : undefined
                  }
                  role={canEditBinsRow ? "button" : undefined}
                  tabIndex={canEditBinsRow ? 0 : undefined}
                  title={canEditBinsRow ? "Edit bins record" : undefined}
                >
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {dateLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {row.buildingLabel}
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 text-sm text-gray-700 ${
                      canEditIn
                        ? "cursor-pointer transition-colors duration-200 hover:bg-[#f0ebe7] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#8c7569]"
                        : ""
                    }`}
                    onClick={
                      canEditIn
                        ? (event) => {
                            event.stopPropagation()
                            openInEdit()
                          }
                        : undefined
                    }
                    onKeyDown={
                      canEditIn
                        ? (event) => {
                            event.stopPropagation()
                            handleCaretakerEditCellKeyDown(event, openInEdit)
                          }
                        : undefined
                    }
                    role={canEditIn ? "button" : undefined}
                    tabIndex={canEditIn ? 0 : undefined}
                    title={canEditIn ? "Edit Time IN" : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {row.inValue ? (
                        <span>{formatTime(row.inValue)}</span>
                      ) : null}
                      {canCheckIn && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleOpenCaretakerManualAction(row, "checkin")
                          }}
                          className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Check in
                        </button>
                      )}
                    </div>
                  </td>
                  <td
                    className={`border border-gray-400 px-3 py-2 text-sm text-gray-700 ${
                      canEditOut
                        ? "cursor-pointer transition-colors duration-200 hover:bg-[#f0ebe7] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#8c7569]"
                        : ""
                    }`}
                    onClick={
                      canEditOut
                        ? (event) => {
                            event.stopPropagation()
                            openOutEdit()
                          }
                        : undefined
                    }
                    onKeyDown={
                      canEditOut
                        ? (event) => {
                            event.stopPropagation()
                            handleCaretakerEditCellKeyDown(event, openOutEdit)
                          }
                        : undefined
                    }
                    role={canEditOut ? "button" : undefined}
                    tabIndex={canEditOut ? 0 : undefined}
                    title={canEditOut ? "Edit Time OUT" : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {row.outValue ? (
                        <span>{formatTime(row.outValue)}</span>
                      ) : null}
                      {canCheckOut && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleOpenCaretakerManualAction(row, "checkout")
                          }}
                          className="rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Check out
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

      {filteredCaretakerHistoryRows.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#55311c]">
            Showing {caretakerHistoryRangeStart}-{caretakerHistoryRangeEnd} of{" "}
            {filteredCaretakerHistoryRows.length}{" "}
            {activeTab === "bins" ? "bin" : "work time"} record(s)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setCaretakerHistoryPage(Math.max(0, caretakerHistoryPage - 1))
              }
              disabled={caretakerHistoryPage === 0}
              className="rounded border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="flex items-center px-2 text-sm font-semibold text-[#55311c]">
              {caretakerHistoryPage + 1} / {totalCaretakerHistoryPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCaretakerHistoryPage(
                  Math.min(
                    totalCaretakerHistoryPages - 1,
                    caretakerHistoryPage + 1,
                  ),
                )
              }
              disabled={
                caretakerHistoryPage >= totalCaretakerHistoryPages - 1
              }
              className="rounded border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(caretakerManualAction)}
        onOpenChange={handleCaretakerManualActionDialogChange}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              {caretakerManualAction?.mode === "checkin"
                ? `Create ${
                    caretakerManualAction?.recordType === "work-time"
                      ? "caretaker"
                      : "bin"
                  } check in`
                : `Create ${
                    caretakerManualAction?.recordType === "work-time"
                      ? "caretaker"
                      : "bin"
                  } check out`}
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Enter the time for{" "}
              {caretakerManualAction
                ? formatDate(caretakerManualAction.referenceIso)
                : "-"}
              {caretakerManualAction?.recordType === "bins" &&
                caretakerManualAction.buildingLabel && (
                  <>
                    {" "}
                    at{" "}
                    <span className="font-semibold text-[#55311c]">
                      {caretakerManualAction.buildingLabel}
                    </span>
                  </>
                )}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c]"
                htmlFor="caretaker-manual-time"
              >
                Time
              </label>
              <input
                id="caretaker-manual-time"
                type="time"
                value={caretakerManualTimeValue}
                onChange={(event) =>
                  setCaretakerManualTimeValue(event.target.value)
                }
                className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              />
            </div>
            {caretakerManualAction && (
              <p className="text-xs text-[rgba(0,0,0,0.65)]">
                {caretakerManualAction.mode === "checkin"
                  ? `Time IN must be before ${formatTime(
                      caretakerManualAction.referenceIso,
                    )}.`
                  : `Time OUT must be after ${formatTime(
                      caretakerManualAction.referenceIso,
                    )}.`}
              </p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={resetCaretakerManualAction}
              disabled={isSavingCaretakerManualAction}
              className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCaretakerManualAction}
              disabled={isSavingCaretakerManualAction}
              className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isSavingCaretakerManualAction ? "Saving..." : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showMonthlyGoalsModal}
        onOpenChange={(open) => {
          setShowMonthlyGoalsModal(open)
          if (!open) resetMonthlyGoalForm()
        }}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              Caretaker monthly goals
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Define the monthly hour targets used by the caretaker summary.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-3 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] md:items-end">
              <div>
                <label
                  htmlFor="caretaker-goal-month"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Month
                </label>
                <input
                  id="caretaker-goal-month"
                  type="month"
                  value={goalFormMonth}
                  onChange={(event) => setGoalFormMonth(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
              <div>
                <label
                  htmlFor="caretaker-goal-hours"
                  className="block text-sm font-semibold text-[#55311c]"
                >
                  Target hours
                </label>
                <input
                  id="caretaker-goal-hours"
                  type="number"
                  min="0"
                  step="0.25"
                  value={goalFormHours}
                  onChange={(event) => setGoalFormHours(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  placeholder="0"
                />
              </div>
              <div className="flex gap-2 md:justify-end">
                {editingMonthlyGoal && (
                  <button
                    type="button"
                    onClick={resetMonthlyGoalForm}
                    className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveMonthlyGoal}
                  disabled={saveMonthlyGoalMutation.isPending}
                  className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveMonthlyGoalMutation.isPending
                    ? "Saving..."
                    : editingMonthlyGoal
                      ? "Update"
                      : "Save"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e5e0dc]">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#f3ede8]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#55311c]">
                      Month
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#55311c]">
                      Target
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#55311c]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingMonthlyGoals && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-4 text-center text-sm text-[rgba(0,0,0,0.65)]"
                      >
                        Loading goals...
                      </td>
                    </tr>
                  )}
                  {!isLoadingMonthlyGoals && monthlyGoalsError && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-4 text-center text-sm text-[#8a3d1b]"
                      >
                        {monthlyGoalsError instanceof Error
                          ? monthlyGoalsError.message
                          : "Failed to load monthly goals."}
                      </td>
                    </tr>
                  )}
                  {!isLoadingMonthlyGoals &&
                    !monthlyGoalsError &&
                    monthlyGoals.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-4 text-center text-sm text-[rgba(0,0,0,0.65)]"
                      >
                        No monthly goals defined.
                      </td>
                    </tr>
                    )}
                  {monthlyGoals.map((goal) => (
                    <tr key={goal.id} className="border-t border-[#eee7e2]">
                      <td className="px-4 py-3 text-sm text-[#55311c]">
                        {new Date(`${goal.month_start}T00:00:00Z`).toLocaleDateString(
                          "en-GB",
                          {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          },
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#55311c]">
                        {formatDecimalHours(goal.target_hours)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditMonthlyGoal(goal)}
                            className="rounded-lg border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMonthlyGoal(goal)}
                            disabled={deletingMonthlyGoalId === goal.id}
                            className="rounded-lg border border-[#d28a6f] px-3 py-2 text-sm font-semibold text-[#8a3d1b] transition-all duration-200 hover:bg-[#fff1ea] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingMonthlyGoalId === goal.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:px-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-[#55311c]">
                Caretaker hours invoice
              </h3>
              <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
                Enter the total hours, optionally attach media, then preview and
                download the PDF.
              </p>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="caretaker-invoice-hours"
                  >
                    Total hours
                  </label>
                  <input
                    id="caretaker-invoice-hours"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={invoiceHours}
                    onChange={(event) => {
                      setInvoiceHours(event.target.value)
                      setInvoicePdfDataUrl("")
                      setInvoicePdfFileName("")
                    }}
                    placeholder="20.00"
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="caretaker-invoice-amount"
                  >
                    Amount
                  </label>
                  <input
                    id="caretaker-invoice-amount"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={invoiceAmount}
                    onChange={(event) => {
                      setInvoiceAmount(event.target.value)
                      setInvoicePdfDataUrl("")
                      setInvoicePdfFileName("")
                    }}
                    placeholder="-120.00"
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm font-semibold text-[#55311c]">
                  <input
                    type="checkbox"
                    checked={includeCaretakerInvoiceTable}
                    onChange={(event) => {
                      setIncludeCaretakerInvoiceTable(event.target.checked)
                      setInvoicePdfDataUrl("")
                      setInvoicePdfFileName("")
                    }}
                    className="h-4 w-4 accent-[#8c7569]"
                  />
                  Include summary table in PDF
                </label>

                <div>
                  <label
                    className="block text-sm font-semibold text-[#55311c]"
                    htmlFor="caretaker-invoice-media"
                  >
                    Media
                  </label>
                  <input
                    id="caretaker-invoice-media"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleCaretakerInvoiceFileChange}
                    className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                  />
                  {invoiceMediaData && (
                    <div className="mt-3 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm text-[#55311c]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-semibold">
                          {invoiceMediaName || "Attached media"}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setInvoiceMediaName("")
                            setInvoiceMediaData(null)
                            setInvoicePdfDataUrl("")
                            setInvoicePdfFileName("")
                          }}
                          className="shrink-0 rounded border border-[#8c7569] px-2 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Remove
                        </button>
                      </div>
                      {isImageDataUrl(invoiceMediaData) && (
                        <img
                          src={invoiceMediaData}
                          alt="Invoice media preview"
                          className="mt-3 max-h-32 rounded border border-[#d9d0ca] bg-white"
                        />
                      )}
                    </div>
                  )}
                </div>

                {invoicePdfDataUrl && (
                  <a
                    href={invoicePdfDataUrl}
                    download={
                      invoicePdfFileName ||
                      `caretaker-hours-invoice-${new Date().toISOString().slice(0, 10)}.pdf`
                    }
                    className="block w-full rounded-lg bg-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
                  >
                    Download preview
                  </a>
                )}
                {isGeneratingInvoicePdf && (
                  <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-sm font-semibold text-[#55311c]">
                    Generating preview...
                  </div>
                )}
              </div>

              <div className="min-h-[520px] rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3">
                {invoicePdfDataUrl ? (
                  <iframe
                    title="Caretaker hours invoice preview"
                    src={invoicePdfDataUrl}
                    className="h-[520px] w-full rounded border border-[#d9d0ca] bg-white"
                  />
                ) : (
                  <div className="flex h-[520px] items-center justify-center rounded border border-dashed border-[#d9d0ca] bg-white px-6 text-center text-sm text-[rgba(0,0,0,0.65)]">
                    Generate the invoice to preview the PDF here.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowInvoiceModal(false)
                  resetCaretakerInvoiceForm()
                }}
                disabled={isGeneratingInvoicePdf || isLaunchingCaretakerInvoice}
                className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleLaunchCaretakerInvoice}
                disabled={isGeneratingInvoicePdf || isLaunchingCaretakerInvoice}
                className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isLaunchingCaretakerInvoice ? "Launching..." : "Launch invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              {editingCaretakerRecord.recordType === "bins"
                ? "Edit bins record"
                : "Edit caretaker record"}
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              {editingCaretakerRecord.recordType === "bins" ? (
                <>
                  Update this bins record
                  {editingCaretakerRecord.buildingLabel
                    ? ` for ${editingCaretakerRecord.buildingLabel}`
                    : ""}
                  {editingCaretakerRecord.dateValue
                    ? ` on ${formatDate(editingCaretakerRecord.dateValue)}`
                    : ""}
                  .
                </>
              ) : (
                <>
                  Update the {editingCaretakerRecord.label.toLowerCase()} for
                  this work time record.
                </>
              )}
            </p>

            <div className="mt-4 grid gap-4">
              {editingCaretakerRecord.recordType === "bins" ? (
                <>
                  {editingCaretakerRecord.inRecordId &&
                    editingCaretakerRecord.inOriginalIso && (
                      <div>
                        <label
                          className="block text-sm font-semibold text-[#55311c]"
                          htmlFor="caretaker-edit-time-in"
                        >
                          Time IN
                        </label>
                        <input
                          id="caretaker-edit-time-in"
                          type="time"
                          value={editedCaretakerInTimeValue}
                          onChange={(event) => {
                            setEditedCaretakerInTimeValue(event.target.value)
                            setIsConfirmingCaretakerRecordDelete(false)
                          }}
                          className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                        />
                      </div>
                    )}
                  {editingCaretakerRecord.outRecordId &&
                    editingCaretakerRecord.outOriginalIso && (
                      <div>
                        <label
                          className="block text-sm font-semibold text-[#55311c]"
                          htmlFor="caretaker-edit-time-out"
                        >
                          Time OUT
                        </label>
                        <input
                          id="caretaker-edit-time-out"
                          type="time"
                          value={editedCaretakerOutTimeValue}
                          onChange={(event) => {
                            setEditedCaretakerOutTimeValue(event.target.value)
                            setIsConfirmingCaretakerRecordDelete(false)
                          }}
                          className="mt-1 w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                        />
                      </div>
                    )}
                </>
              ) : (
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
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {editingCaretakerRecord.recordType === "bins" && (
                <button
                  type="button"
                  onClick={handleDeleteEditingCaretakerRecord}
                  disabled={
                    isSavingCaretakerRecordEdit ||
                    deletingBinsRowKey === editingCaretakerRecord.rowKey
                  }
                  className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition-all duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {deletingBinsRowKey === editingCaretakerRecord.rowKey
                    ? "Deleting..."
                    : isConfirmingCaretakerRecordDelete
                      ? "Confirm?"
                      : "Delete"}
                </button>
              )}
              <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCaretakerRecord(null)
                    setIsConfirmingCaretakerRecordDelete(false)
                  }}
                  disabled={
                    deletingBinsRowKey === editingCaretakerRecord.rowKey
                  }
                  className="w-full rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCaretakerRecordEdit}
                  disabled={
                    isSavingCaretakerRecordEdit ||
                    deletingBinsRowKey === editingCaretakerRecord.rowKey
                  }
                  className="w-full rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isSavingCaretakerRecordEdit ? "Saving..." : "Save"}
                </button>
              </div>
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
        car1: morador.car1,
        car2: morador.car2,
        car3: morador.car3,
        edit_target_id: null,
      }

      if (morador.cargo === 0 && !current.owner_1) current.owner_1 = morador
      if (morador.cargo === 1 && !current.owner_2) current.owner_2 = morador
      if (morador.cargo === 2 && !current.tenant) current.tenant = morador
      if (morador.cargo === 3 && !current.agent) current.agent = morador
      current.reading_types = morador.reading_types
      current.car1 = current.car1 ?? morador.car1
      current.car2 = current.car2 ?? morador.car2
      current.car3 = current.car3 ?? morador.car3
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
      <label
        className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#55311c]"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={morador.receives_flat_reading_sms}
          onClick={(event) => event.stopPropagation()}
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
      <label
        className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#55311c]"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={morador.receives_twilio_sms}
          onClick={(event) => event.stopPropagation()}
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
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="break-words">{morador.nome}</span>
        <span className="break-words text-[10px] text-[rgba(85,49,28,0.72)]">
          {morador.email || "no email"}
        </span>
      </div>
    )
  }

  const renderFlatPlates = (row: FlatResidentRow) => {
    const plates = [row.car1, row.car2, row.car3].filter(
      (plate): plate is string => Boolean(plate?.trim()),
    )

    if (plates.length === 0) return "-"

    return (
      <div className="flex min-w-0 flex-col leading-tight">
        {plates.map((plate) => (
          <span key={plate} className="break-words">
            {plate}
          </span>
        ))}
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

  const openResidentEdit = (
    residentId: EntityId,
    context?: ResidentEditContext,
  ) => {
    setEditingId(residentId)
    setEditContext(context || null)
    setShowForm(true)
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
              <table className="w-full min-w-full border-collapse rounded-lg bg-white text-[11px] md:text-xs [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-[10px] [&_th]:leading-tight [&_th]:whitespace-normal [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:leading-tight [&_td]:whitespace-normal">
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
                          Car Reg
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
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedFlatRows.map((row) => (
                        <tr
                          key={row.key}
                          className="cursor-pointer hover:bg-[#f5f1ee]"
                          onClick={() => {
                            if (row.edit_target_id === null) return
                            const targetResident =
                              row.owner_1 ??
                              row.owner_2 ??
                              row.tenant ??
                              row.agent ??
                              null
                            openResidentEdit(row.edit_target_id, {
                              editTitle: `Edit ${getResidentRoleEditToken(targetResident?.cargo ?? -1)}`,
                              flatResidents: {
                                owner_1: row.owner_1,
                                owner_2: row.owner_2,
                                tenant: row.tenant,
                                agent: row.agent,
                              },
                            })
                          }}
                        >
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.building_nome}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {formatFlatNumber(row.flat_numero, row.flat_label)}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {renderFlatPlates(row)}
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
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedResidents.map((morador) => (
                        <tr
                          key={morador.id}
                          className="cursor-pointer hover:bg-[#f5f1ee]"
                          onClick={() =>
                            openResidentEdit(morador.id, {
                              editTitle: `Edit ${getResidentRoleEditToken(morador.cargo)}`,
                            })
                          }
                        >
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
                              onClick={(event) => event.stopPropagation()}
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
                              onClick={(event) => event.stopPropagation()}
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
                              onClick={(event) => event.stopPropagation()}
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
                              onClick={(event) => event.stopPropagation()}
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

function getDefaultResidentFormData() {
  return {
    nome: "",
    email: "",
    mobile: "",
    cargo: 0,
    receives_flat_reading_sms: false,
    receives_twilio_sms: false,
    car1: "",
    car2: "",
    flat_id: "",
  }
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
  const [formData, setFormData] = useState(getDefaultResidentFormData)
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
    : formData.cargo === 0
  const activeEditTitle = activePreviewResident
    ? `Edit ${getResidentRoleEditToken(activePreviewResident.cargo)}`
    : (editContext?.editTitle ?? "Edit resident")

  useEffect(() => {
    setActiveEditingId(editingId)
    if (!editingId) {
      setFormData(getDefaultResidentFormData())
    }
  }, [editingId])

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const deleteResidentMutation = useMutation({
    mutationFn: async (id: EntityId) =>
      apiCall(`/api/v1/moradores/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      showSuccessToast("Resident deleted successfully!")
      await queryClient.invalidateQueries({ queryKey: ["Residents"] })
      await queryClient.invalidateQueries({ queryKey: ["buildings"] })
      onBack()
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Error deleting resident"
      showErrorToast(message)
    },
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
        : name === "cargo"
          ? Number(value)
          : value
    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
  }

  const handleDeleteResident = () => {
    if (!activeEditingId || deleteResidentMutation.isPending) return

    const residentName =
      formData.nome.trim() || activePreviewResident?.nome || ""
    const confirmationMessage = residentName
      ? `Delete ${residentName}?`
      : "Delete this resident?"
    const confirmed =
      typeof window === "undefined" ? true : window.confirm(confirmationMessage)

    if (!confirmed) return

    deleteResidentMutation.mutate(activeEditingId)
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
                  <option value="0">Owner 1</option>
                  <option value="1">Owner 2</option>
                  <option value="2">Tenant</option>
                  <option value="3">Agent</option>
                </select>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end gap-4">
            {activeEditingId && (
              <button
                type="button"
                onClick={handleDeleteResident}
                disabled={deleteResidentMutation.isPending || isSubmitting}
                className="rounded-lg border border-[#d28a6f] px-6 py-3 font-['Nunito',sans-serif] text-[#8a3d1b] transition-all duration-300 hover:bg-[#fff1ea] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteResidentMutation.isPending
                  ? "Deleting..."
                  : "Delete Resident"}
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-gray-500 px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || deleteResidentMutation.isPending}
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
