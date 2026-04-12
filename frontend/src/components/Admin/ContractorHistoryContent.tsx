import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useDeferredValue, useEffect, useMemo, useState } from "react"

import { OpenAPI } from "@/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"

type EntityId = string | number

interface ApiListResponse<T> {
  data: T[]
  count?: number
}

interface Building {
  id: EntityId
  nome: string
}

interface ContractorVisitOption {
  id: EntityId
  name: string
  company: string
  building_name: string
  job_description: string
  mobile: string
  in_at: string
  out_at?: string | null
}

interface ContractorHistoryCategory {
  id: EntityId
  name: string
  created_at: string
  updated_at: string
}

interface ContractorHistoryRecord {
  id: EntityId
  category_id: EntityId
  category_name: string
  contractor_visit_id: EntityId
  created_new_visit: boolean
  next_enabled: boolean
  next_interval_unit?: string | null
  next_interval_value?: number | null
  next_job_at?: string | null
  next_notify_at?: string | null
  next_notification_sent_at?: string | null
  name: string
  company: string
  building_name: string
  job_description: string
  mobile: string
  visit_in_at: string
  visit_out_at?: string | null
  history_created_at: string
  history_updated_at: string
  condominio_id: EntityId
}

interface ContractorHistoryFormState {
  isNewVisit: boolean
  hasNext: boolean
  nextUnit: "week" | "month"
  nextValue: string
  contractorVisitId: string
  categoryId: string
  name: string
  company: string
  buildingId: string
  jobDescription: string
  mobile: string
  inDate: string
  inTime: string
  outDate: string
  outTime: string
}

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
    options.body =
      typeof requestOptions.body === "string"
        ? requestOptions.body
        : JSON.stringify(requestOptions.body)
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

const formatDateTime = (value?: string | null) => {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "-"
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const getDefaultTimeInputValue = () =>
  toTimeInputValue(new Date().toISOString()) || "09:00"

const getEmptyContractorHistoryForm = (): ContractorHistoryFormState => {
  const currentDate = toDateInputValue()
  const currentTime = getDefaultTimeInputValue()
  return {
    isNewVisit: false,
    hasNext: false,
    nextUnit: "week",
    nextValue: "1",
    contractorVisitId: "",
    categoryId: "",
    name: "",
    company: "",
    buildingId: "",
    jobDescription: "",
    mobile: "",
    inDate: currentDate,
    inTime: currentTime,
    outDate: currentDate,
    outTime: currentTime,
  }
}

const combineDateAndTimeToIso = (dateValue: string, timeValue: string) => {
  if (!dateValue || !timeValue) return ""
  const combined = new Date(`${dateValue}T${timeValue}`)
  if (Number.isNaN(combined.getTime())) return ""
  return combined.toISOString()
}

const normalizeValue = (value: string) => value.trim().toLowerCase()

const buildContractorOptionLabel = (visit: ContractorVisitOption) =>
  `${formatDate(visit.in_at)} ${formatTime(visit.in_at)} | ${visit.mobile} | ${visit.name} | ${visit.company} | ${visit.building_name} | ${visit.job_description}`

const addMonths = (value: Date, months: number) => {
  const result = new Date(value)
  const expectedMonth = result.getMonth() + months
  result.setMonth(expectedMonth)
  while (result.getMonth() !== ((expectedMonth % 12) + 12) % 12) {
    result.setDate(result.getDate() - 1)
  }
  return result
}

const calculateNextSchedule = ({
  baseIso,
  enabled,
  unit,
  value,
}: {
  baseIso?: string | null
  enabled: boolean
  unit: "week" | "month"
  value: number
}) => {
  if (!enabled || !baseIso || !Number.isFinite(value) || value < 1) return null
  const baseDate = new Date(baseIso)
  if (Number.isNaN(baseDate.getTime())) return null

  const nextJobDate =
    unit === "week"
      ? new Date(baseDate.getTime() + value * 7 * 24 * 60 * 60 * 1000)
      : addMonths(baseDate, value)
  const notifyDate = new Date(
    nextJobDate.getTime() -
      (unit === "week" ? 2 : 7) * 24 * 60 * 60 * 1000,
  )

  return {
    nextJobAt: nextJobDate.toISOString(),
    notifyAt: notifyDate.toISOString(),
  }
}

const toGoogleCalendarDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

const buildGoogleCalendarUrl = ({
  title,
  details,
  location,
  startAt,
  endAt,
}: {
  title: string
  details: string
  location: string
  startAt: string
  endAt: string
}) => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details,
    location,
    dates: `${toGoogleCalendarDateTime(startAt)}/${toGoogleCalendarDateTime(endAt)}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const ONE_HOUR_MS = 60 * 60 * 1000

const getVisitDurationMs = ({
  startAt,
  endAt,
}: {
  startAt?: string | null
  endAt?: string | null
}) => {
  if (!startAt || !endAt) return ONE_HOUR_MS
  const startDate = new Date(startAt)
  const endDate = new Date(endAt)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return ONE_HOUR_MS
  }
  const diffMs = endDate.getTime() - startDate.getTime()
  return diffMs > 0 ? diffMs : ONE_HOUR_MS
}

const buildNextJobGoogleCalendarUrl = ({
  nextJobAt,
  visitInAt,
  visitOutAt,
  categoryName,
  contractorName,
  company,
  jobDescription,
  buildingName,
  mobile,
}: {
  nextJobAt?: string | null
  visitInAt?: string | null
  visitOutAt?: string | null
  categoryName?: string | null
  contractorName?: string | null
  company?: string | null
  jobDescription?: string | null
  buildingName?: string | null
  mobile?: string | null
}) => {
  if (!nextJobAt) return ""
  const nextJobDate = new Date(nextJobAt)
  if (Number.isNaN(nextJobDate.getTime())) return ""

  const endAt = new Date(
    nextJobDate.getTime() +
      getVisitDurationMs({ startAt: visitInAt, endAt: visitOutAt }),
  ).toISOString()
  const cleanCategory = categoryName?.trim() || "Contractor"
  const cleanJob = jobDescription?.trim() || "Scheduled contractor job"
  const cleanCompany = company?.trim() || "Unknown company"
  const cleanContractorName = contractorName?.trim() || "Unknown contractor"
  const cleanBuilding = buildingName?.trim() || "OakHill Park"
  const cleanMobile = mobile?.trim() || "-"

  return buildGoogleCalendarUrl({
    title: `${cleanCategory}: ${cleanJob}`,
    details: [
      `Contractor: ${cleanContractorName}`,
      `Company: ${cleanCompany}`,
      `Job: ${cleanJob}`,
      `Building: ${cleanBuilding}`,
      `Mobile: ${cleanMobile}`,
      `Category: ${cleanCategory}`,
    ].join("\n"),
    location: cleanBuilding,
    startAt: nextJobDate.toISOString(),
    endAt,
  })
}

export function ContractorHistoryContent() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [buildingFilter, setBuildingFilter] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [form, setForm] = useState<ContractorHistoryFormState>(
    getEmptyContractorHistoryForm,
  )
  const [editingHistory, setEditingHistory] =
    useState<ContractorHistoryRecord | null>(null)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [page, setPage] = useState(0)
  const pageSize = 10
  const deferredSearch = useDeferredValue(search.trim())

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["contractor-history-buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const { data: categoriesData } = useQuery<
    ApiListResponse<ContractorHistoryCategory>
  >({
    queryKey: ["contractor-history-categories"],
    queryFn: () => apiCall("/api/v1/contractor-access/history/categories"),
  })

  const { data: contractorOptionsData } = useQuery<
    ApiListResponse<ContractorVisitOption>
  >({
    queryKey: ["contractor-history-visit-options"],
    queryFn: () =>
      apiCall("/api/v1/contractor-access/", {
        skip: 0,
        limit: 1000,
      }),
    placeholderData: keepPreviousData,
  })

  const { data: historiesData, isLoading } = useQuery<
    ApiListResponse<ContractorHistoryRecord>
  >({
    queryKey: [
      "contractor-history-records",
      deferredSearch,
      dateFrom,
      dateTo,
      buildingFilter,
      categoryFilter,
      page,
      pageSize,
    ],
    queryFn: () =>
      apiCall("/api/v1/contractor-access/history", {
        skip: page * pageSize,
        limit: pageSize,
        search: deferredSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        building_name: buildingFilter || undefined,
        category_id: categoryFilter || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const buildings = useMemo(
    () =>
      [...((buildingsData?.data || []) as Building[])].sort((a, b) =>
        a.nome.localeCompare(b.nome),
      ),
    [buildingsData?.data],
  )
  const categories = useMemo(
    () =>
      [...((categoriesData?.data || []) as ContractorHistoryCategory[])].sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    [categoriesData?.data],
  )
  const contractorOptions = useMemo(
    () => (contractorOptionsData?.data || []) as ContractorVisitOption[],
    [contractorOptionsData?.data],
  )
  const histories = useMemo(
    () => (historiesData?.data || []) as ContractorHistoryRecord[],
    [historiesData?.data],
  )
  const totalHistories = historiesData?.count || histories.length
  const totalPages = Math.max(1, Math.ceil(totalHistories / pageSize))
  const rangeStart = totalHistories === 0 ? 0 : page * pageSize + 1
  const rangeEnd = Math.min((page + 1) * pageSize, totalHistories)

  useEffect(() => {
    setPage(0)
  }, [deferredSearch, dateFrom, dateTo, buildingFilter, categoryFilter])

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, Math.max(0, totalPages - 1)))
  }, [totalPages])

  const selectedContractorOption = useMemo(
    () =>
      contractorOptions.find(
        (option) => String(option.id) === form.contractorVisitId,
      ) || null,
    [contractorOptions, form.contractorVisitId],
  )
  const selectedCategory = useMemo(
    () =>
      categories.find((category) => String(category.id) === form.categoryId) || null,
    [categories, form.categoryId],
  )
  const selectedBuildingName = useMemo(
    () =>
      buildings.find((building) => String(building.id) === form.buildingId)?.nome || "",
    [buildings, form.buildingId],
  )

  const previewBaseIso = useMemo(() => {
    if (form.isNewVisit) {
      return combineDateAndTimeToIso(form.outDate, form.outTime)
    }
    return selectedContractorOption?.out_at || selectedContractorOption?.in_at || null
  }, [
    form.isNewVisit,
    form.outDate,
    form.outTime,
    selectedContractorOption?.in_at,
    selectedContractorOption?.out_at,
  ])

  const nextSchedulePreview = useMemo(
    () =>
      calculateNextSchedule({
        baseIso: previewBaseIso,
        enabled: form.hasNext,
        unit: form.nextUnit,
        value: Number(form.nextValue),
      }),
    [form.hasNext, form.nextUnit, form.nextValue, previewBaseIso],
  )
  const previewGoogleCalendarUrl = useMemo(() => {
    if (!nextSchedulePreview?.nextJobAt) return ""

    const visitInAt = form.isNewVisit
      ? combineDateAndTimeToIso(form.inDate, form.inTime)
      : selectedContractorOption?.in_at || null
    const visitOutAt = form.isNewVisit
      ? combineDateAndTimeToIso(form.outDate, form.outTime)
      : selectedContractorOption?.out_at || selectedContractorOption?.in_at || null

    return buildNextJobGoogleCalendarUrl({
      nextJobAt: nextSchedulePreview.nextJobAt,
      visitInAt,
      visitOutAt,
      categoryName: selectedCategory?.name || null,
      contractorName: form.isNewVisit
        ? form.name
        : selectedContractorOption?.name || null,
      company: form.isNewVisit
        ? form.company
        : selectedContractorOption?.company || null,
      jobDescription: form.isNewVisit
        ? form.jobDescription
        : selectedContractorOption?.job_description || null,
      buildingName: form.isNewVisit
        ? selectedBuildingName
        : selectedContractorOption?.building_name || null,
      mobile: form.isNewVisit
        ? form.mobile
        : selectedContractorOption?.mobile || null,
    })
  }, [
    form.company,
    form.inDate,
    form.inTime,
    form.isNewVisit,
    form.jobDescription,
    form.mobile,
    form.name,
    form.outDate,
    form.outTime,
    nextSchedulePreview?.nextJobAt,
    selectedBuildingName,
    selectedCategory?.name,
    selectedContractorOption?.building_name,
    selectedContractorOption?.company,
    selectedContractorOption?.in_at,
    selectedContractorOption?.job_description,
    selectedContractorOption?.mobile,
    selectedContractorOption?.name,
    selectedContractorOption?.out_at,
  ])

  const createCategoryMutation = useMutation({
    mutationFn: (payload: { name: string }) =>
      apiCall("/api/v1/contractor-access/history/categories", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (category: ContractorHistoryCategory) => {
      showSuccessToast("Category created successfully")
      setForm((previous) => ({
        ...previous,
        categoryId: String(category.id),
      }))
      setNewCategoryName("")
      setIsCategoryDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ["contractor-history-categories"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Could not create category",
      )
    },
  })

  const saveHistoryMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: EntityId
      payload: Record<string, unknown>
    }) =>
      apiCall(
        id
          ? `/api/v1/contractor-access/history/${id}`
          : "/api/v1/contractor-access/history",
        {
          method: id ? "PATCH" : "POST",
          body: payload,
        },
      ),
    onSuccess: () => {
      showSuccessToast(
        editingHistory
          ? "History updated successfully"
          : "History saved successfully",
      )
      setIsHistoryDialogOpen(false)
      setEditingHistory(null)
      setForm(getEmptyContractorHistoryForm())
      queryClient.invalidateQueries({ queryKey: ["contractor-history-records"] })
      queryClient.invalidateQueries({ queryKey: ["contractor-history-visit-options"] })
      queryClient.invalidateQueries({ queryKey: ["contractor-visits"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Could not save history",
      )
    },
  })

  const deleteHistoryMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/contractor-access/history/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      showSuccessToast("History deleted successfully")
      if (editingHistory) {
        setIsHistoryDialogOpen(false)
        setEditingHistory(null)
        setForm(getEmptyContractorHistoryForm())
      }
      queryClient.invalidateQueries({ queryKey: ["contractor-history-records"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Could not delete history",
      )
    },
  })

  const resetForm = () => {
    setEditingHistory(null)
    setForm(getEmptyContractorHistoryForm())
  }

  const closeHistoryDialog = () => {
    if (saveHistoryMutation.isPending) return
    setIsCategoryDialogOpen(false)
    setIsHistoryDialogOpen(false)
    resetForm()
  }

  const openCreateHistoryDialog = () => {
    resetForm()
    setIsCategoryDialogOpen(false)
    setIsHistoryDialogOpen(true)
  }

  const findBuildingIdByName = (buildingName: string) => {
    const match = buildings.find(
      (building) => normalizeValue(building.nome) === normalizeValue(buildingName),
    )
    return match ? String(match.id) : ""
  }

  const handleEdit = (history: ContractorHistoryRecord) => {
    setIsCategoryDialogOpen(false)
    setIsHistoryDialogOpen(true)
    setEditingHistory(history)
    const nextUnit =
      history.next_interval_unit === "month" ? "month" : "week"
    const nextValue = history.next_interval_value
      ? String(history.next_interval_value)
      : "1"

    if (history.created_new_visit) {
      setForm({
        ...getEmptyContractorHistoryForm(),
        isNewVisit: true,
        hasNext: history.next_enabled,
        nextUnit,
        nextValue,
        contractorVisitId: "",
        categoryId: String(history.category_id),
        name: history.name,
        company: history.company,
        buildingId: findBuildingIdByName(history.building_name),
        jobDescription: history.job_description,
        mobile: history.mobile,
        inDate: toDateInputValue(new Date(history.visit_in_at)),
        inTime: toTimeInputValue(history.visit_in_at),
        outDate: toDateInputValue(
          new Date(history.visit_out_at || history.visit_in_at),
        ),
        outTime: toTimeInputValue(history.visit_out_at || history.visit_in_at),
      })
    } else {
      setForm({
        ...getEmptyContractorHistoryForm(),
        isNewVisit: false,
        hasNext: history.next_enabled,
        nextUnit,
        nextValue,
        contractorVisitId: String(history.contractor_visit_id),
        categoryId: String(history.category_id),
      })
    }
  }

  const handleCreateCategory = () => {
    const trimmedName = newCategoryName.trim()
    if (!trimmedName) {
      showErrorToast("Enter a category name")
      return
    }
    createCategoryMutation.mutate({ name: trimmedName })
  }

  const handleDelete = (history: ContractorHistoryRecord) => {
    if (
      !window.confirm(
        `Delete history for ${history.name} in category ${history.category_name}?`,
      )
    ) {
      return
    }
    deleteHistoryMutation.mutate(history.id)
  }

  const buildPayload = () => {
    if (!form.categoryId) {
      showErrorToast("Select a category")
      return null
    }

    const normalizedNextValue = Number(form.nextValue)
    if (form.hasNext) {
      if (!Number.isInteger(normalizedNextValue) || normalizedNextValue < 1) {
        showErrorToast("Enter a valid value for the next job schedule")
        return null
      }

      if (!previewBaseIso) {
        showErrorToast("Enter a valid visit date/time to calculate the next job")
        return null
      }
    }

    if (form.isNewVisit) {
      const requiredValues = [
        form.name,
        form.company,
        form.buildingId,
        form.jobDescription,
        form.mobile,
        form.inDate,
        form.inTime,
        form.outDate,
        form.outTime,
      ]
      if (requiredValues.some((value) => !String(value).trim())) {
        showErrorToast("Fill all contractor fields for a new history record")
        return null
      }

      const inAt = combineDateAndTimeToIso(form.inDate, form.inTime)
      const outAt = combineDateAndTimeToIso(form.outDate, form.outTime)

      if (!inAt || !outAt) {
        showErrorToast("Enter valid IN and OUT date/time values")
        return null
      }

      if (new Date(outAt).getTime() < new Date(inAt).getTime()) {
        showErrorToast("Time OUT must be after Time IN")
        return null
      }

      return {
        category_id: form.categoryId,
        created_new_visit: true,
        next_enabled: form.hasNext,
        next_interval_unit: form.hasNext ? form.nextUnit : null,
        next_interval_value: form.hasNext ? normalizedNextValue : null,
        name: form.name.trim(),
        company: form.company.trim(),
        building_id: form.buildingId,
        job_description: form.jobDescription.trim(),
        mobile: form.mobile.trim(),
        in_at: inAt,
        out_at: outAt,
      }
    }

    if (!form.contractorVisitId) {
      showErrorToast("Select an existing contractor record")
      return null
    }

    return {
      category_id: form.categoryId,
      created_new_visit: false,
      next_enabled: form.hasNext,
      next_interval_unit: form.hasNext ? form.nextUnit : null,
      next_interval_value: form.hasNext ? normalizedNextValue : null,
      contractor_visit_id: form.contractorVisitId,
    }
  }

  const handleSubmit = () => {
    const payload = buildPayload()
    if (!payload) return

    saveHistoryMutation.mutate({
      id: editingHistory?.id,
      payload,
    })
  }

  const isSubmitDisabled = form.isNewVisit
    ? !form.categoryId ||
      !form.name.trim() ||
      !form.company.trim() ||
      !form.buildingId ||
      !form.jobDescription.trim() ||
      !form.mobile.trim() ||
      !form.inDate ||
      !form.inTime ||
      !form.outDate ||
      !form.outTime ||
      (form.hasNext &&
        (!Number.isInteger(Number(form.nextValue)) ||
          Number(form.nextValue) < 1 ||
          !previewBaseIso))
    : !form.categoryId ||
      !form.contractorVisitId ||
      (form.hasNext &&
        (!Number.isInteger(Number(form.nextValue)) ||
          Number(form.nextValue) < 1 ||
          !previewBaseIso))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              History
            </h2>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Attach a category to an existing contractor record or create a
              closed contractor record and save it directly as history.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateHistoryDialog}
            className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
          >
            New history
          </button>
        </div>
      </div>

      <Dialog
        open={isHistoryDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsHistoryDialogOpen(true)
            return
          }
          closeHistoryDialog()
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">
              {editingHistory ? "Edit history" : "New history"}
            </DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Attach a category to an existing contractor record or create a
              closed contractor record and save it directly as history.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
          <label className="inline-flex items-center gap-3 text-sm font-semibold text-[#55311c]">
            <input
              type="checkbox"
              checked={form.isNewVisit}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  isNewVisit: event.target.checked,
                  contractorVisitId: event.target.checked
                    ? ""
                    : previous.contractorVisitId,
                }))
              }
              className="h-4 w-4 rounded border-[#d9d0ca] text-[#8c7569] focus:ring-[#8c7569]"
            />
            New
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label
                htmlFor="contractor-history-category"
                className="mb-1 block text-sm font-semibold text-[#55311c]"
              >
                Category
              </label>
              <select
                id="contractor-history-category"
                value={form.categoryId}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    categoryId: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              >
                <option value="">
                  {categories.length === 0
                    ? "Create a category first"
                    : "Select a category"}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setIsCategoryDialogOpen(true)}
                className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
              >
                New category
              </button>
            </div>
          </div>

          {!form.isNewVisit ? (
            <div>
              <label
                htmlFor="contractor-history-visit"
                className="mb-1 block text-sm font-semibold text-[#55311c]"
              >
                Contractor record
              </label>
              <select
                id="contractor-history-visit"
                value={form.contractorVisitId}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    contractorVisitId: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
              >
                <option value="">Select a contractor record</option>
                {contractorOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {buildContractorOptionLabel(option)}
                  </option>
                ))}
              </select>

              {selectedContractorOption && (
                <div className="mt-3 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4 text-sm text-[#55311c]">
                  <p>
                    <span className="font-semibold">Contractor:</span>{" "}
                    {selectedContractorOption.name}
                  </p>
                  <p>
                    <span className="font-semibold">Company:</span>{" "}
                    {selectedContractorOption.company}
                  </p>
                  <p>
                    <span className="font-semibold">Building:</span>{" "}
                    {selectedContractorOption.building_name}
                  </p>
                  <p>
                    <span className="font-semibold">Job:</span>{" "}
                    {selectedContractorOption.job_description}
                  </p>
                  <p>
                    <span className="font-semibold">Mobile:</span>{" "}
                    {selectedContractorOption.mobile}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="contractor-history-name"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Name
                </label>
                <input
                  id="contractor-history-name"
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <div>
                <label
                  htmlFor="contractor-history-company"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Company
                </label>
                <input
                  id="contractor-history-company"
                  type="text"
                  value={form.company}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      company: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <div>
                <label
                  htmlFor="contractor-history-building"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Building
                </label>
                <select
                  id="contractor-history-building"
                  value={form.buildingId}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      buildingId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                >
                  <option value="">Select a building</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={String(building.id)}>
                      {building.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="contractor-history-mobile"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Mobile
                </label>
                <input
                  id="contractor-history-mobile"
                  type="text"
                  value={form.mobile}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      mobile: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="contractor-history-job"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Job description
                </label>
                <input
                  id="contractor-history-job"
                  type="text"
                  value={form.jobDescription}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      jobDescription: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <div>
                <label
                  htmlFor="contractor-history-in-date"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Date IN
                </label>
                <input
                  id="contractor-history-in-date"
                  type="date"
                  value={form.inDate}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      inDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <div>
                <label
                  htmlFor="contractor-history-in-time"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Time IN
                </label>
                <input
                  id="contractor-history-in-time"
                  type="time"
                  value={form.inTime}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      inTime: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <div>
                <label
                  htmlFor="contractor-history-out-date"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Date OUT
                </label>
                <input
                  id="contractor-history-out-date"
                  type="date"
                  value={form.outDate}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      outDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>

              <div>
                <label
                  htmlFor="contractor-history-out-time"
                  className="mb-1 block text-sm font-semibold text-[#55311c]"
                >
                  Time OUT
                </label>
                <input
                  id="contractor-history-out-time"
                  type="time"
                  value={form.outTime}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      outTime: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
            <label className="inline-flex items-center gap-3 text-sm font-semibold text-[#55311c]">
              <input
                type="checkbox"
                checked={form.hasNext}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    hasNext: event.target.checked,
                    nextUnit: event.target.checked ? previous.nextUnit : "week",
                    nextValue: event.target.checked ? previous.nextValue : "1",
                  }))
                }
                className="h-4 w-4 rounded border-[#d9d0ca] text-[#8c7569] focus:ring-[#8c7569]"
              />
              Next
            </label>

            {form.hasNext && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_140px]">
                  <div>
                    <label
                      htmlFor="contractor-history-next-unit"
                      className="mb-1 block text-sm font-semibold text-[#55311c]"
                    >
                      Repeat in
                    </label>
                    <select
                      id="contractor-history-next-unit"
                      value={form.nextUnit}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          nextUnit:
                            event.target.value === "month" ? "month" : "week",
                        }))
                      }
                      className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    >
                      <option value="week">Weeks</option>
                      <option value="month">Months</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="contractor-history-next-value"
                      className="mb-1 block text-sm font-semibold text-[#55311c]"
                    >
                      Value
                    </label>
                    <input
                      id="contractor-history-next-value"
                      type="number"
                      min="1"
                      step="1"
                      value={form.nextValue}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          nextValue: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-[#e5e0dc] bg-white p-4 text-sm text-[#55311c]">
                  {nextSchedulePreview ? (
                    <div className="space-y-2">
                      <p>
                        <span className="font-semibold">Next job:</span>{" "}
                        {formatDateTime(nextSchedulePreview.nextJobAt)}
                      </p>
                      <p>
                        <span className="font-semibold">SMS reminder:</span>{" "}
                        {formatDateTime(nextSchedulePreview.notifyAt)}
                      </p>
                      <p className="text-xs text-[rgba(0,0,0,0.65)]">
                        SMS recipient: owner 1 from Martlett flat 6.
                      </p>
                      {previewGoogleCalendarUrl && (
                        <a
                          href={previewGoogleCalendarUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded border border-[#8c7569] px-3 py-2 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Share on Google Calendar
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[rgba(0,0,0,0.65)]">
                      Select a contractor record or enter a valid Time OUT to
                      calculate the next job.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveHistoryMutation.isPending || isSubmitDisabled}
              className="rounded-lg bg-[#8c7569] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveHistoryMutation.isPending
                ? "Saving..."
                : editingHistory
                  ? "Save changes"
                  : "Save history"}
            </button>
            <button
              type="button"
              onClick={closeHistoryDialog}
              disabled={saveHistoryMutation.isPending}
              className="rounded-lg border border-[#d9d0ca] px-5 py-3 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label
              htmlFor="contractor-history-search"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Search
            </label>
            <input
              id="contractor-history-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, company or job"
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>

          <div>
            <label
              htmlFor="contractor-history-date-from"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Date from
            </label>
            <input
              id="contractor-history-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>

          <div>
            <label
              htmlFor="contractor-history-date-to"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Date to
            </label>
            <input
              id="contractor-history-date-to"
              type="date"
              min={dateFrom || undefined}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>

          <div>
            <label
              htmlFor="contractor-history-building-filter"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Building
            </label>
            <select
              id="contractor-history-building-filter"
              value={buildingFilter}
              onChange={(event) => setBuildingFilter(event.target.value)}
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
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
              htmlFor="contractor-history-category-filter"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
            >
              Category
            </label>
            <select
              id="contractor-history-category-filter"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-[rgba(0,0,0,0.6)]">
          {totalHistories === 0
            ? "Showing 0 history record(s)."
            : `Showing ${rangeStart}-${rangeEnd} of ${totalHistories} history record(s).`}
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px] border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Saved
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Visit date
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
                  Category
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Source
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Next job
                </th>
                <th className="border border-[#736055] px-3 py-2 text-left text-sm font-semibold text-white">
                  Notification
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
                    colSpan={14}
                    className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    Loading history records...
                  </td>
                </tr>
              )}
              {!isLoading && histories.length === 0 && (
                <tr>
                  <td
                    colSpan={14}
                    className="border border-[#e5e0dc] bg-white px-3 py-4 text-center text-sm text-[rgba(0,0,0,0.7)]"
                  >
                    No history records found.
                  </td>
                </tr>
              )}
              {!isLoading &&
                histories.map((history) => (
                  <tr key={history.id} className="bg-white hover:bg-[#f8f5f3]">
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatDateTime(history.history_created_at)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatDate(history.visit_in_at)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatTime(history.visit_in_at)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {formatTime(history.visit_out_at)}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.name}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.company}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.building_name}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.job_description}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.mobile}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.category_name}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.created_new_visit ? "New" : "Existing"}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.next_enabled && history.next_job_at ? (
                        <div>
                          <p>{formatDateTime(history.next_job_at)}</p>
                          <p className="text-xs text-[rgba(0,0,0,0.6)]">
                            Every {history.next_interval_value || 1}{" "}
                            {history.next_interval_unit === "month"
                              ? "month(s)"
                              : "week(s)"}
                          </p>
                        </div>
                      ) : (
                        "Not scheduled"
                      )}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-sm text-[#55311c]">
                      {history.next_enabled && history.next_notify_at ? (
                        <div>
                          <p>{formatDateTime(history.next_notify_at)}</p>
                          <p className="text-xs text-[rgba(0,0,0,0.6)]">
                            {history.next_notification_sent_at
                              ? `SMS sent ${formatDateTime(history.next_notification_sent_at)}`
                              : "SMS pending"}
                          </p>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="border border-[#e5e0dc] px-3 py-2 text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        {history.next_enabled && history.next_job_at && (
                          <a
                            href={buildNextJobGoogleCalendarUrl({
                              nextJobAt: history.next_job_at,
                              visitInAt: history.visit_in_at,
                              visitOutAt:
                                history.visit_out_at || history.visit_in_at,
                              categoryName: history.category_name,
                              contractorName: history.name,
                              company: history.company,
                              jobDescription: history.job_description,
                              buildingName: history.building_name,
                              mobile: history.mobile,
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                          >
                            Calendar
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEdit(history)}
                          className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(history)}
                          disabled={deleteHistoryMutation.isPending}
                          className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 transition-all duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {totalHistories > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#55311c]">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="rounded border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="rounded border border-[#8c7569] px-3 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={isCategoryDialogOpen}
        onOpenChange={(open) => {
          setIsCategoryDialogOpen(open)
          if (!open) {
            setNewCategoryName("")
          }
        }}
      >
        <DialogContent className="border-[#e5e0dc] bg-white text-[#55311c] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#55311c]">New category</DialogTitle>
            <DialogDescription className="text-[rgba(0,0,0,0.7)]">
              Create a contractor history category to use in the records below.
            </DialogDescription>
          </DialogHeader>

          <div>
            <label
              htmlFor="contractor-history-new-category"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              Category name
            </label>
            <input
              id="contractor-history-new-category"
              type="text"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Enter a category name"
              className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsCategoryDialogOpen(false)}
              className="rounded border border-[#d9d0ca] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={createCategoryMutation.isPending}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createCategoryMutation.isPending ? "Creating..." : "Create"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
