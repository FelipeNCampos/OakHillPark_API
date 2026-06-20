import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { ArrowUp, Paperclip, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { OpenAPI } from "@/client"
import { enforceHttpsUrl, resolveApiBase } from "@/config/api"
import useCustomToast from "@/hooks/useCustomToast"

type TaskStatus = "todo" | "done"
type ApiTaskStatus = TaskStatus | "paused"
type BoardMode = "manager" | "caretaker" | "public"
type TaskPriority = 1 | 2 | 3
type TaskPriorityFilter = "all" | "1" | "2" | "3"
type TaskWeather = "sun" | "rain"
type TaskWeatherFilter = "all" | TaskWeather

type ApiTask = {
  id: string
  code: string
  title: string
  description: string
  cover_image_data?: string | null
  requires_completion_image: boolean
  status: ApiTaskStatus
  priority: TaskPriority
  weather?: TaskWeather | null
  assigned_to_user_id: string
  assigned_to_name: string
  building_id?: string | null
  building_label: string
  spent_seconds: number
  created_at: string
  updated_at: string
}

type Task = Omit<ApiTask, "status"> & {
  status: TaskStatus
}

type TaskMessage = {
  id: string
  task_id: string
  sender_user_id: string
  sender_name: string
  sender_role: "manager" | "caretaker"
  text?: string | null
  image_data?: string | null
  created_at: string
}

type TaskListResponse = {
  data: ApiTask[]
  count: number
}

type TaskMessageListResponse = {
  data: TaskMessage[]
  count: number
}

type TaskBoardMetadata = {
  common_area_label: string
  buildings: Array<{
    id: string
    name: string
  }>
}

const isDateWithinRange = (date: string, dateFrom: string, dateTo: string) => {
  if (dateFrom && date < dateFrom) return false
  if (dateTo && date > dateTo) return false
  return true
}

const buildDateRangeLabel = (dateFrom: string, dateTo: string) => {
  const formatDate = (value: string) => {
    if (!value) return ""
    const [year, month, day] = value.split("-")
    if (!year || !month || !day) return value
    return `${day}/${month}/${year}`
  }

  if (dateFrom && dateTo) return `${formatDate(dateFrom)} to ${formatDate(dateTo)}`
  if (dateFrom) return `From ${formatDate(dateFrom)}`
  if (dateTo) return `Until ${formatDate(dateTo)}`
  return "All dates"
}

const formatTaskReportDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const buildTaskReportEmailHtml = (periodLabel: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#2f2f2f;line-height:1.5;">
    <h2 style="margin:0 0 12px;color:#55311c;">Hello,</h2>
    <p style="margin:0 0 10px;">Please find attached your tasks report.</p>
    <p style="margin:0 0 16px;"><strong>Period:</strong> ${periodLabel}</p>
    <p style="margin:0 0 8px;">If you have any questions, please reply to this email.</p>
    <p style="margin:0;color:#666;">OakHill Park Team</p>
  </div>
`.trim()

const apiCall = async (
  endpoint: string,
  options?: { method?: string; body?: unknown },
) => {
  const base = enforceHttpsUrl(resolveApiBase(OpenAPI.BASE))
  const requestUrl = enforceHttpsUrl(`${base}${endpoint}`)
  let response: Response
  try {
    response = await fetch(requestUrl, {
      method: options?.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
      body:
        options?.body === undefined
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body),
    })
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof Error &&
        /fetch|network|load failed|failed to fetch/i.test(error.message))
    ) {
      throw new Error(
        `Could not reach the API server at ${requestUrl}. Current page: ${
          typeof window === "undefined" ? "unknown" : window.location.origin
        }. If you attached a photo, try a smaller image.`,
      )
    }
    throw error
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`
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

  if (response.status === 204) return null
  return response.json()
}

const statusLabel: Record<TaskStatus, string> = {
  todo: "To Do",
  done: "Done",
}

const TASK_STATUS_ORDER: TaskStatus[] = ["todo", "done"]
const TASK_PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 1, label: "Priority 1" },
  { value: 2, label: "Priority 2" },
  { value: 3, label: "Priority 3" },
]
const TASK_WEATHER_OPTIONS: Array<{ value: TaskWeather; label: string }> = [
  { value: "sun", label: "Sun" },
  { value: "rain", label: "Rain" },
]

const STATUS_EVENT_PREFIX = "[STATUS]"
const COVER_IMAGE_PREFIX = "[COVER_IMAGE]"
const HIDDEN_TASK_BUILDING_NAMES = new Set(["cleaner", "caretaker"])
const TASKS_PER_PAGE = 15
const MAX_TASK_IMAGE_INPUT_BYTES = 12 * 1024 * 1024
const MAX_TASK_IMAGE_OUTPUT_LENGTH = 2_000_000
const MAX_TASK_IMAGE_DIMENSION = 1400

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("Could not read image"))
    }
    reader.onerror = () => reject(new Error("Could not read image"))
    reader.readAsDataURL(file)
  })

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Could not process image"))
    image.src = src
  })

const optimizeTaskImage = async (file: File) => {
  const originalDataUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(originalDataUrl)
  const scale = Math.min(
    1,
    MAX_TASK_IMAGE_DIMENSION / Math.max(image.naturalWidth, 1),
    MAX_TASK_IMAGE_DIMENSION / Math.max(image.naturalHeight, 1),
  )
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale))
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Could not process image")
  }

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  let quality = 0.82
  let optimizedDataUrl = canvas.toDataURL("image/jpeg", quality)
  while (
    optimizedDataUrl.length > MAX_TASK_IMAGE_OUTPUT_LENGTH &&
    quality > 0.45
  ) {
    quality -= 0.08
    optimizedDataUrl = canvas.toDataURL("image/jpeg", quality)
  }

  return optimizedDataUrl.length < originalDataUrl.length
    ? optimizedDataUrl
    : originalDataUrl
}

const normalizeTaskStatus = (status: ApiTaskStatus): TaskStatus =>
  status === "paused" ? "todo" : status

const normalizeTaskPriority = (
  priority: number | null | undefined,
): TaskPriority => (priority === 1 || priority === 3 ? priority : 2)

const normalizeTaskWeather = (
  weather: string | null | undefined,
): TaskWeather => (weather === "rain" ? "rain" : "sun")

const getTaskWeatherLabel = (weather: string | null | undefined) =>
  TASK_WEATHER_OPTIONS.find((option) => option.value === normalizeTaskWeather(weather))
    ?.label || "Sun"

const taskPriorityCardClass: Record<TaskPriority, string> = {
  1: "border-[#e0b8a8] bg-[#fff6f2] hover:bg-[#fff1eb]",
  2: "border-[#d8d6b8] bg-[#fcfbef] hover:bg-[#f8f6e5]",
  3: "border-[#bfd5cc] bg-[#f2faf6] hover:bg-[#ebf6f1]",
}

const taskPriorityBadgeClass: Record<TaskPriority, string> = {
  1: "border-[#e0b8a8] bg-[#fae7df] text-[#7a4634]",
  2: "border-[#d8d6b8] bg-[#efedcf] text-[#665f2f]",
  3: "border-[#bfd5cc] bg-[#dcefe7] text-[#3f6655]",
}

const getStatusEventLabel = (text?: string | null): string => {
  if (!text) return ""
  const payload = text.replace(STATUS_EVENT_PREFIX, "").trim()
  const [, nextStatus] = payload.split("->")
  const normalizedLabel = (nextStatus || payload).trim()
  return normalizedLabel === "In Progress" ? "To Do" : normalizedLabel
}

const formatTaskEventTimestamp = (value: string) => {
  const date = new Date(value)
  return `Created at ${date.toLocaleDateString("en-GB")} ${date.toLocaleTimeString(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  )}`
}

const buildTaskApiPath = (
  mode: BoardMode,
  publicCondominioId: string | null,
  path = "",
) => {
  if (mode === "public") {
    if (!publicCondominioId) return null
    const queryPrefix = path.includes("?") ? "&" : "?"
    return `/api/v1/tasks/public${path}${queryPrefix}condominio_id=${encodeURIComponent(publicCondominioId)}`
  }

  if (!path) return "/api/v1/tasks/"
  return `/api/v1/tasks${path}`
}

export function TasksBoard({
  mode,
  publicCondominioId = null,
  title = "Tasks",
  subtitle,
}: {
  mode: BoardMode
  publicCondominioId?: string | null
  title?: string
  subtitle?: string
}) {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const queryClient = useQueryClient()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [newImageData, setNewImageData] = useState<string | null>(null)
  const [newBuildingId, setNewBuildingId] = useState("common_area")
  const [newPriority, setNewPriority] = useState<TaskPriority>(2)
  const [newWeather, setNewWeather] = useState<TaskWeather>("sun")
  const [buildingFilter, setBuildingFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] =
    useState<TaskPriorityFilter>("all")
  const [weatherFilter, setWeatherFilter] = useState<TaskWeatherFilter>("all")
  const [taskPages, setTaskPages] = useState<Record<TaskStatus, number>>({
    todo: 1,
    done: 1,
  })
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [reportDateFrom, setReportDateFrom] = useState("")
  const [reportDateTo, setReportDateTo] = useState("")
  const [reportEmailDraft, setReportEmailDraft] = useState("")
  const [reportRecipients, setReportRecipients] = useState<string[]>([])
  const [isSendingReport, setIsSendingReport] = useState(false)
  const [chatText, setChatText] = useState("")
  const [chatImageData, setChatImageData] = useState<string | null>(null)
  const [showCompletionPhotoPrompt, setShowCompletionPhotoPrompt] =
    useState(false)
  const chatComposerRef = useRef<HTMLDivElement | null>(null)
  const chatImageInputRef = useRef<HTMLInputElement | null>(null)
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isManager = mode === "manager"
  const isPublic = mode === "public"
  const shouldRequireCompletionPhoto = !isManager && !isPublic

  const resolveTaskEndpoint = (path = "") =>
    buildTaskApiPath(mode, publicCondominioId, path)

  const requestTaskApi = (
    path = "",
    options?: { method?: string; body?: unknown },
  ) => {
    const endpoint = resolveTaskEndpoint(path)
    if (!endpoint) {
      throw new Error("Invalid QR code. Condominio not found.")
    }
    return apiCall(endpoint, options)
  }

  const { data: tasksData, isLoading: tasksLoading } =
    useQuery<TaskListResponse>({
      queryKey: ["tasks", mode, publicCondominioId],
      queryFn: () => requestTaskApi(""),
      enabled: !isPublic || Boolean(publicCondominioId),
      refetchInterval: selectedTaskId ? 10000 : 15000,
    })

  const { data: taskBoardMetadata } = useQuery<TaskBoardMetadata>({
    queryKey: ["tasks-metadata", mode],
    queryFn: () => apiCall("/api/v1/tasks/metadata"),
    enabled: isManager,
    staleTime: 60000,
  })

  const tasks = useMemo(
    () =>
      (tasksData?.data || []).map((task) => ({
        ...task,
        status: normalizeTaskStatus(task.status as ApiTaskStatus),
        priority: normalizeTaskPriority(task.priority),
        weather: normalizeTaskWeather(task.weather),
      })),
    [tasksData],
  )
  const selectedTaskSummary = tasks.find((t) => t.id === selectedTaskId) || null
  const publicBuildingOptions = useMemo(() => {
    const optionMap = new Map<string, string>()
    tasks.forEach((task) => {
      if (task.status !== "todo") return
      if (!task.building_id) return
      optionMap.set(task.building_id, task.building_label)
    })
    return Array.from(optionMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [tasks])
  const commonAreaLabel =
    taskBoardMetadata?.common_area_label ||
    tasks.find((task) => !task.building_id)?.building_label ||
    "Common areas"
  const buildingOptions = isManager
    ? taskBoardMetadata?.buildings || []
    : publicBuildingOptions
  const visibleBuildingOptions = useMemo(
    () =>
      buildingOptions.filter(
        (building) =>
          !HIDDEN_TASK_BUILDING_NAMES.has(building.name.trim().toLowerCase()),
      ),
    [buildingOptions],
  )
  const hasCommonAreaTasks = useMemo(
    () => tasks.some((task) => task.status === "todo" && !task.building_id),
    [tasks],
  )
  const filteredTasks = useMemo(() => {
    let nextTasks = tasks
    if (buildingFilter === "common_area") {
      nextTasks = nextTasks.filter((task) => !task.building_id)
    } else if (buildingFilter !== "all") {
      nextTasks = nextTasks.filter((task) => task.building_id === buildingFilter)
    }
    if (priorityFilter !== "all") {
      nextTasks = nextTasks.filter(
        (task) => String(task.priority) === priorityFilter,
      )
    }
    if (weatherFilter !== "all") {
      nextTasks = nextTasks.filter((task) => task.weather === weatherFilter)
    }
    return nextTasks
  }, [buildingFilter, priorityFilter, tasks, weatherFilter])

  useEffect(() => {
    if (
      buildingFilter !== "all" &&
      buildingFilter !== "common_area" &&
      !visibleBuildingOptions.some((building) => building.id === buildingFilter)
    ) {
      setBuildingFilter("all")
    }
  }, [buildingFilter, visibleBuildingOptions])

  useEffect(() => {
    if (
      newBuildingId !== "common_area" &&
      !visibleBuildingOptions.some((building) => building.id === newBuildingId)
    ) {
      setNewBuildingId("common_area")
    }
  }, [newBuildingId, visibleBuildingOptions])

  const { data: messagesData, isLoading: messagesLoading } =
    useQuery<TaskMessageListResponse>({
      queryKey: ["task-messages", mode, publicCondominioId, selectedTaskId],
      queryFn: () => requestTaskApi(`/${selectedTaskId}/messages`),
      enabled: Boolean(selectedTaskId),
      refetchInterval: selectedTaskId ? 8000 : false,
    })

  const { data: selectedTaskData, isLoading: selectedTaskLoading } =
    useQuery<ApiTask>({
      queryKey: ["task", mode, publicCondominioId, selectedTaskId],
      queryFn: () => requestTaskApi(`/${selectedTaskId}`),
      enabled: Boolean(selectedTaskId),
      refetchInterval: selectedTaskId ? 8000 : false,
    })

  const selectedTask = useMemo(() => {
    const task = selectedTaskData || selectedTaskSummary
    if (!task) return null
    return {
      ...task,
      status: normalizeTaskStatus(task.status as ApiTaskStatus),
      priority: normalizeTaskPriority(task.priority),
      weather: normalizeTaskWeather(task.weather),
    }
  }, [selectedTaskData, selectedTaskSummary])

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      todo: [],
      done: [],
    }
    filteredTasks.forEach((task) => {
      groups[task.status].push(task)
    })
    return groups
  }, [filteredTasks])
  const visibleStatuses = useMemo(
    () => (isPublic ? (["todo"] as const) : TASK_STATUS_ORDER),
    [isPublic],
  )
  const taskPageCounts = useMemo(
    () => ({
      todo: Math.max(1, Math.ceil(groupedTasks.todo.length / TASKS_PER_PAGE)),
      done: Math.max(1, Math.ceil(groupedTasks.done.length / TASKS_PER_PAGE)),
    }),
    [groupedTasks],
  )
  const paginatedTasks = useMemo(() => {
    const getPageItems = (status: TaskStatus) => {
      const currentPage = Math.min(taskPages[status], taskPageCounts[status])
      const startIndex = (currentPage - 1) * TASKS_PER_PAGE
      return groupedTasks[status].slice(startIndex, startIndex + TASKS_PER_PAGE)
    }

    return {
      todo: getPageItems("todo"),
      done: getPageItems("done"),
    }
  }, [groupedTasks, taskPageCounts, taskPages])

  useEffect(() => {
    setTaskPages({ todo: 1, done: 1 })
  }, [buildingFilter, priorityFilter, weatherFilter])

  useEffect(() => {
    setTaskPages((current) => ({
      todo: Math.min(current.todo, taskPageCounts.todo),
      done: Math.min(current.done, taskPageCounts.done),
    }))
  }, [taskPageCounts])

  const taskReportHeaders = useMemo(
    () => [
      "Code",
      "Title",
      "Building",
      "Status",
      "Priority",
      "Wheather",
      "Assigned",
      "Created",
      "Updated",
    ],
    [],
  )

  const taskReportRows = useMemo(
    () =>
      tasks
        .filter((task) =>
          isDateWithinRange(
            task.created_at.slice(0, 10),
            reportDateFrom,
            reportDateTo,
          ),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((task) => [
          task.code || "-",
          task.title || "-",
          task.building_label || "-",
          statusLabel[task.status],
          `P${task.priority}`,
          getTaskWeatherLabel(task.weather),
          task.assigned_to_name || "-",
          formatTaskReportDate(task.created_at),
          formatTaskReportDate(task.updated_at),
        ]),
    [reportDateFrom, reportDateTo, tasks],
  )

  const taskReportPeriodLabel = useMemo(
    () => buildDateRangeLabel(reportDateFrom, reportDateTo),
    [reportDateFrom, reportDateTo],
  )

  const createTaskReportDoc = useCallback(() => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(16)
    doc.text("Tasks Report", pageWidth / 2, 36, { align: "center" })
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, 40, 56)
    doc.text(`Period: ${taskReportPeriodLabel}`, 40, 72)

    autoTable(doc, {
      startY: 90,
      head: [taskReportHeaders],
      body:
        taskReportRows.length > 0
          ? taskReportRows
          : [["-", "-", "-", "-", "-", "-", "-", "No tasks found.", "-"]],
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
      bodyStyles: {
        textColor: [40, 40, 40],
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    })

    return doc
  }, [taskReportHeaders, taskReportPeriodLabel, taskReportRows])

  const taskReportDataUrl = useMemo(() => {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      return ""
    }
    return createTaskReportDoc().output("datauristring")
  }, [
    createTaskReportDoc,
    reportDateFrom,
    reportDateTo,
  ])

  const taskReportFileName = `tasks-report-${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`

  const handleAddReportRecipient = () => {
    const email = reportEmailDraft.trim()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showErrorToast("Invalid email address")
      return
    }
    setReportRecipients((current) =>
      current.includes(email) ? current : [...current, email],
    )
    setReportEmailDraft("")
  }

  const handleDownloadTaskReport = () => {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      showErrorToast("Invalid date range")
      return
    }
    const link = document.createElement("a")
    link.href = createTaskReportDoc().output("datauristring")
    link.download = taskReportFileName
    link.click()
  }

  const handleSendTaskReport = async () => {
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      showErrorToast("Invalid date range")
      return
    }

    const draftEmail = reportEmailDraft.trim()
    const recipients = draftEmail
      ? Array.from(new Set([...reportRecipients, draftEmail]))
      : reportRecipients

    if (recipients.length === 0) {
      showErrorToast("Add at least one email")
      return
    }

    const invalidEmail = recipients.find(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    )
    if (invalidEmail) {
      showErrorToast(`Invalid email address: ${invalidEmail}`)
      return
    }

    const fileDataBase64 =
      createTaskReportDoc().output("datauristring").split(",")[1] || ""
    if (!fileDataBase64) {
      showErrorToast("Failed to prepare report file")
      return
    }

    try {
      setIsSendingReport(true)
      for (const email of recipients) {
        await apiCall("/api/v1/utils/send-report-email/", {
          method: "POST",
          body: {
            email_to: email,
            subject: "Tasks Report",
            html_content: buildTaskReportEmailHtml(taskReportPeriodLabel),
            file_name: taskReportFileName,
            file_data_base64: fileDataBase64,
          },
        })
      }
      setReportRecipients(recipients)
      setReportEmailDraft("")
      showSuccessToast("Report sent by email")
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Failed to send report by email",
      )
    } finally {
      setIsSendingReport(false)
    }
  }

  const allMessages = messagesData?.data || []

  const statusEvents = useMemo(
    () =>
      allMessages.filter(
        (msg) =>
          Boolean(msg.text) && String(msg.text).startsWith(STATUS_EVENT_PREFIX),
      ),
    [allMessages],
  )

  const chatMessages = useMemo(
    () =>
      allMessages.filter(
        (msg) =>
          (!msg.text || !String(msg.text).startsWith(STATUS_EVENT_PREFIX)) &&
          (!msg.text || !String(msg.text).startsWith(COVER_IMAGE_PREFIX)),
      ),
    [allMessages],
  )

  const createTaskMutation = useMutation({
    mutationFn: () =>
      requestTaskApi("", {
        method: "POST",
        body: {
          title: newTitle.trim(),
          description: "",
          image_data: newImageData,
          priority: newPriority,
          weather: newWeather,
          building_id:
            newBuildingId === "common_area" ? null : newBuildingId || null,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Task created")
      setNewTitle("")
      setNewImageData(null)
      setNewBuildingId("common_area")
      setNewPriority(2)
      setNewWeather("sun")
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Error creating task",
      )
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({
      taskId,
      status,
      imageData,
    }: {
      taskId: string
      status: TaskStatus
      imageData?: string | null
    }) =>
      requestTaskApi(`/${taskId}/status`, {
        method: "PATCH",
        body: { status, image_data: imageData || null },
      }),
    onSuccess: () => {
      setChatImageData(null)
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      if (selectedTaskId) {
        queryClient.invalidateQueries({
          queryKey: ["task", mode, publicCondominioId, selectedTaskId],
        })
        queryClient.invalidateQueries({
          queryKey: ["task-messages", mode, publicCondominioId, selectedTaskId],
        })
      }
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Error updating status",
      )
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: () =>
      requestTaskApi(`/${selectedTaskId}/messages`, {
        method: "POST",
        body: {
          text: chatText.trim() || null,
          image_data: chatImageData,
        },
      }),
    onSuccess: (createdMessage: TaskMessage) => {
      setChatText("")
      setChatImageData(null)
      queryClient.setQueryData<TaskMessageListResponse | undefined>(
        ["task-messages", mode, publicCondominioId, selectedTaskId],
        (current) => {
          if (!current) {
            return { data: [createdMessage], count: 1 }
          }

          return {
            ...current,
            data: [...current.data, createdMessage],
            count: (current.count || current.data.length) + 1,
          }
        },
      )
      queryClient.invalidateQueries({
        queryKey: ["task-messages", mode, publicCondominioId, selectedTaskId],
      })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (error: unknown) => {
      showErrorToast(
        error instanceof Error ? error.message : "Error sending message",
      )
    },
  })

  const handleCreateTask = () => {
    if (!newTitle.trim()) {
      showErrorToast("Task title is required")
      return
    }
    createTaskMutation.mutate()
  }

  const handleSelectImage = (
    file: File | null,
    target: "create" | "chat" = "chat",
  ) => {
    if (!file) return
    if (file.size > MAX_TASK_IMAGE_INPUT_BYTES) {
      showErrorToast("Image is too large. Please use a file up to 12 MB.")
      return
    }
    optimizeTaskImage(file)
      .then((imageData) => {
        if (target === "create") {
          setNewImageData(imageData)
          return
        }
        setChatImageData(imageData)
        setShowCompletionPhotoPrompt(false)
      })
      .catch((error: unknown) => {
        showErrorToast(
          error instanceof Error ? error.message : "Could not process image",
        )
      })
  }

  useEffect(() => {
    if (!selectedTaskId) return
    if (!chatImageData && !showCompletionPhotoPrompt) return
    chatComposerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    })
  }, [chatImageData, selectedTaskId, showCompletionPhotoPrompt])

  useEffect(() => {
    const textarea = chatTextareaRef.current
    if (!textarea) return

    textarea.style.height = "0px"
    const nextHeight = Math.min(textarea.scrollHeight, 180)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden"
  }, [chatText, selectedTaskId])

  const handleSendMessage = () => {
    if (!selectedTaskId) return
    if (!isManager && selectedTask?.status === "done") {
      showErrorToast("Completed tasks are locked for the caretaker")
      return
    }
    if (!chatText.trim() && !chatImageData) {
      showErrorToast("Type a message or attach an image")
      return
    }
    sendMessageMutation.mutate()
  }

  const moveTaskToStatus = (task: Task, nextStatus: TaskStatus) => {
    if (task.status === nextStatus || updateStatusMutation.isPending) return
    if (!isManager && task.status === "done") return
    if (
      nextStatus === "done" &&
      shouldRequireCompletionPhoto &&
      task.requires_completion_image
    ) {
      openTaskPopup(task.id, { promptCompletionPhoto: true })
      return
    }
    updateStatusMutation.mutate({ taskId: task.id, status: nextStatus })
  }

  const handleDropOnColumn = (
    targetStatus: TaskStatus,
    taskIdFromDrop?: string,
  ) => {
    const droppedTaskId = taskIdFromDrop || draggingTaskId
    if (!droppedTaskId) return
    const task = tasks.find((item) => item.id === droppedTaskId)
    setDraggingTaskId(null)
    if (!task) return
    moveTaskToStatus(task, targetStatus)
  }

  const openTaskPopup = (
    taskId: string,
    options?: { promptCompletionPhoto?: boolean },
  ) => {
    setSelectedTaskId(taskId)
    setChatText("")
    setChatImageData(null)
    setShowCompletionPhotoPrompt(Boolean(options?.promptCompletionPhoto))
  }

  const closeTaskPopup = () => {
    setSelectedTaskId(null)
    setChatText("")
    setChatImageData(null)
    setShowCompletionPhotoPrompt(false)
  }

  const handleCompleteSelectedTask = () => {
    if (!selectedTaskId || !selectedTask) return
    if (!isManager && selectedTask.status === "done") {
      showErrorToast("Completed tasks are locked for the caretaker")
      return
    }
    if (
      shouldRequireCompletionPhoto &&
      selectedTask.requires_completion_image &&
      !chatImageData
    ) {
      setShowCompletionPhotoPrompt(true)
      return
    }
    updateStatusMutation.mutate({
      taskId: selectedTaskId,
      status: "done",
      imageData: chatImageData,
    })
  }

  const canMarkTaskAsDone = (task: Task) => task.status !== "done"
  const canSendCurrentMessage = Boolean(chatText.trim() || chatImageData)

  const isCaretakerTaskLocked = Boolean(
    selectedTask && !isManager && selectedTask.status === "done",
  )

  const renderStatusActions = (task: Task) => {
    if (task.status === "done") return null

    return (
      <div className="mt-3 flex gap-2">
        {canMarkTaskAsDone(task) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              moveTaskToStatus(task, "done")
            }}
            className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Done
          </button>
        )}
      </div>
    )
  }

  if (isPublic && !publicCondominioId) {
    return (
      <div className="mx-auto w-full max-w-5xl rounded-lg bg-white p-6 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-2xl font-bold text-[#55311c]">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[rgba(0,0,0,0.7)]">Invalid QR code.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <div className="rounded-lg bg-white p-4 shadow-md sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            {title}
          </h2>
          {subtitle && (
            <p className="max-w-2xl text-sm text-[rgba(0,0,0,0.68)] sm:ml-auto sm:text-right">
              {subtitle}
            </p>
          )}
          {(isManager || isPublic) && (
            <div className="grid w-full gap-3 sm:w-[51rem] sm:grid-cols-3">
              <div>
                <label
                  htmlFor="tasks-building-filter"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Building filter
                </label>
                <select
                  id="tasks-building-filter"
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value)}
                  className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black"
                >
                  <option value="all">All buildings</option>
                  {(isManager || hasCommonAreaTasks) && (
                    <option value="common_area">
                      {commonAreaLabel} (Common areas)
                    </option>
                  )}
                  {visibleBuildingOptions.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="tasks-weather-filter"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Wheather filter
                </label>
                <select
                  id="tasks-weather-filter"
                  value={weatherFilter}
                  onChange={(e) =>
                    setWeatherFilter(e.target.value as TaskWeatherFilter)
                  }
                  className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black"
                >
                  <option value="all">All wheather</option>
                  {TASK_WEATHER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="tasks-priority-filter"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                >
                  Priority filter
                </label>
                <select
                  id="tasks-priority-filter"
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as TaskPriorityFilter)
                  }
                  className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black"
                >
                  <option value="all">All priorities</option>
                  {TASK_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {isManager && (
            <button
              type="button"
              onClick={() => setIsReportDialogOpen(true)}
              className="rounded-lg border border-[#8c7569] bg-white px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Report
            </button>
          )}
        </div>
      </div>

      {isReportDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="flex h-[80vh] max-w-none flex-col overflow-hidden rounded-lg border border-[#e5e0dc] bg-white p-0 text-[#55311c] shadow-xl"
            style={{ width: "76vw", maxWidth: "76vw" }}
          >
            <div className="border-b border-[#e5e0dc] px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#55311c]">
                    Tasks Report
                  </h3>
                  <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
                    Generate a PDF report from tasks filtered by period.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReportDialogOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[#55311c] hover:bg-gray-300"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[35%_65%]">
              <div className="space-y-4 overflow-y-auto border-b border-[#e5e0dc] p-6 md:border-b-0 md:border-r">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="tasks-report-date-from"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                    >
                      Start date
                    </label>
                    <input
                      id="tasks-report-date-from"
                      type="date"
                      value={reportDateFrom}
                      onChange={(event) =>
                        setReportDateFrom(event.target.value)
                      }
                      className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tasks-report-date-to"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                    >
                      End date
                    </label>
                    <input
                      id="tasks-report-date-to"
                      type="date"
                      min={reportDateFrom || undefined}
                      value={reportDateTo}
                      onChange={(event) => setReportDateTo(event.target.value)}
                      className="w-full rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="tasks-report-email"
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]"
                  >
                    E-mail(s)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="tasks-report-email"
                      type="email"
                      value={reportEmailDraft}
                      onChange={(event) =>
                        setReportEmailDraft(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return
                        event.preventDefault()
                        handleAddReportRecipient()
                      }}
                      placeholder="name@example.com"
                      className="min-w-0 flex-1 rounded-lg border border-[#d9d0ca] bg-white px-3 py-2 text-sm text-[#55311c] focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                    />
                    <button
                      type="button"
                      onClick={handleAddReportRecipient}
                      className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
                      aria-label="Add email"
                    >
                      +
                    </button>
                  </div>
                  {reportRecipients.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {reportRecipients.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-2 rounded-full border border-[#d9d0ca] bg-[#f5f1ee] px-3 py-1 text-xs font-semibold text-[#55311c]"
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() =>
                              setReportRecipients((current) =>
                                current.filter((item) => item !== email),
                              )
                            }
                            className="text-[#8a3d1b] hover:text-[#55311c]"
                            aria-label={`Remove ${email}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3 text-xs text-[rgba(0,0,0,0.68)]">
                  {taskReportRows.length} task
                  {taskReportRows.length === 1 ? "" : "s"} in preview.
                </div>
              </div>

              <div className="min-h-0 bg-[#f5f1ee] p-4">
                {taskReportDataUrl ? (
                  <iframe
                    title="Tasks Report preview"
                    src={taskReportDataUrl}
                    className="h-full w-full rounded-lg border border-[#d9d0ca] bg-white"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#d9d0ca] bg-white text-sm text-[rgba(0,0,0,0.65)]">
                    Select a valid date range to preview.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center gap-2 border-t border-[#e5e0dc] px-6 py-4">
              <button
                type="button"
                onClick={handleDownloadTaskReport}
                disabled={!taskReportDataUrl}
                className="rounded-lg border border-[#8c7569] px-5 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download
              </button>
              <button
                type="button"
                onClick={handleSendTaskReport}
                disabled={isSendingReport || !taskReportDataUrl}
                className="rounded-lg bg-[#8c7569] px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingReport ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isManager && (
        <div className="rounded-lg bg-white p-4 shadow-md sm:p-6">
          <h3 className="mb-3 text-lg font-bold text-[#55311c]">Create task</h3>
          <div className="grid gap-3 md:grid-cols-5">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              className="rounded border border-[#ddd] px-3 py-2 text-black"
            />
            <select
              value={newBuildingId}
              onChange={(e) => setNewBuildingId(e.target.value)}
              className="rounded border border-[#ddd] px-3 py-2 text-sm text-black"
            >
              <option value="common_area">
                {commonAreaLabel} (Common areas)
              </option>
              {visibleBuildingOptions.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={(e) =>
                setNewPriority(Number(e.target.value) as TaskPriority)
              }
              className="rounded border border-[#ddd] px-3 py-2 text-sm text-black"
            >
              {TASK_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={newWeather}
              onChange={(e) => setNewWeather(e.target.value as TaskWeather)}
              className="rounded border border-[#ddd] px-3 py-2 text-sm text-black"
            >
              {TASK_WEATHER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="rounded border border-[#ddd] px-3 py-2">
              <input
                id="task-create-image-input"
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleSelectImage(e.target.files?.[0] || null, "create")
                }
                className="hidden"
              />
              <label
                htmlFor="task-create-image-input"
                className="cursor-pointer text-sm font-semibold text-[#55311c]"
              >
                Add cover photo
              </label>
              <p className="mt-1 text-xs text-[rgba(0,0,0,0.6)]">
                {newImageData ? "1 photo selected" : "No photo selected"}
              </p>
            </div>
          </div>
          {newImageData && (
            <div className="mt-3 rounded border border-[#ddd] p-2">
              <img
                src={newImageData}
                alt="Task cover preview"
                className="max-h-48 rounded border border-[#ddd]"
              />
              <button
                type="button"
                onClick={() => setNewImageData(null)}
                className="mt-2 rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-gray-300"
              >
                Remove photo
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleCreateTask}
            disabled={createTaskMutation.isPending}
            className="mt-3 rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c] disabled:opacity-60"
          >
            {createTaskMutation.isPending ? "Creating..." : "Create task"}
          </button>
        </div>
      )}

      <div className={`grid gap-4 ${isPublic ? "" : "md:grid-cols-2"}`}>
        {visibleStatuses.map((status) => (
          <div
            key={status}
            className="rounded-lg bg-white p-4 shadow-md"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const taskId = e.dataTransfer.getData("text/plain")
              handleDropOnColumn(status, taskId)
            }}
          >
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#8c7569]">
              {statusLabel[status]}
            </h4>
            <div className="space-y-3">
              {paginatedTasks[status].map((task) => (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  draggable={isManager || task.status !== "done"}
                  onDragStart={(e) => {
                    if (!isManager && task.status === "done") {
                      e.preventDefault()
                      return
                    }
                    e.dataTransfer.setData("text/plain", task.id)
                    setDraggingTaskId(task.id)
                  }}
                  onDragEnd={() => setDraggingTaskId(null)}
                  onClick={() => openTaskPopup(task.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      openTaskPopup(task.id)
                    }
                  }}
                  className={`w-full rounded border p-3 text-left transition-all ${
                    selectedTaskId === task.id
                      ? "border-[#8c7569] bg-[#f7f2ee]"
                      : taskPriorityCardClass[task.priority]
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8c7569]">
                      {task.code}
                    </p>
                    <span
                      className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${taskPriorityBadgeClass[task.priority]}`}
                    >
                      P{task.priority}
                    </span>
                  </div>
                  <p className="font-semibold text-[#55311c]">{task.title}</p>
                  <p className="mt-1 text-xs text-[#8c7569]">
                    Building: {task.building_label}
                  </p>
                  <p className="mt-1 text-xs text-[#8c7569]">
                    Wheather: {getTaskWeatherLabel(task.weather)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-[rgba(0,0,0,0.65)]">
                    {task.description || "No description"}
                  </p>
                  <p className="mt-2 text-xs text-[#8c7569]">
                    Assigned: {task.assigned_to_name}
                  </p>
                  {renderStatusActions(task)}
                </div>
              ))}
              {groupedTasks[status].length === 0 && (
                <p className="text-xs text-[rgba(0,0,0,0.55)]">No tasks</p>
              )}
              {groupedTasks[status].length > 0 && (
                <div className="flex flex-col gap-2 border-t border-[#eadfd8] pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold text-[#8c7569]">
                    Page {Math.min(taskPages[status], taskPageCounts[status])} of{" "}
                    {taskPageCounts[status]} - {groupedTasks[status].length} task
                    {groupedTasks[status].length === 1 ? "" : "s"}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTaskPages((current) => ({
                          ...current,
                          [status]: Math.max(1, current[status] - 1),
                        }))
                      }
                      disabled={taskPages[status] <= 1}
                      className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTaskPages((current) => ({
                          ...current,
                          [status]: Math.min(
                            taskPageCounts[status],
                            current[status] + 1,
                          ),
                        }))
                      }
                      disabled={taskPages[status] >= taskPageCounts[status]}
                      className="rounded border border-[#8c7569] px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-[#f0ebe7] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4">
          <div className="relative max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl sm:max-h-[90vh]">
            <div className="border-b border-[#e6ddd7] px-4 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="pr-2 text-lg font-bold text-[#55311c]">
                    {selectedTask.code} - {selectedTask.title}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-[#8c7569]">
                    Priority {selectedTask.priority}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canMarkTaskAsDone(selectedTask) && (
                    <button
                      type="button"
                      onClick={handleCompleteSelectedTask}
                      disabled={updateStatusMutation.isPending}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {updateStatusMutation.isPending
                        ? "Saving..."
                        : "Mark as done"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeTaskPopup}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-[#55311c] hover:bg-gray-300"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="mt-3">
                {selectedTask.cover_image_data ? (
                  <img
                    src={selectedTask.cover_image_data}
                    alt={`${selectedTask.title} cover`}
                    className="mx-auto mt-3 max-h-60 w-full rounded border border-[#ddd] object-cover sm:max-w-xl"
                  />
                ) : selectedTaskLoading && selectedTask.requires_completion_image ? (
                  <p className="mt-3 text-sm text-[rgba(0,0,0,0.7)]">
                    Loading cover photo...
                  </p>
                ) : (
                  <p className="text-sm text-[rgba(0,0,0,0.7)]">
                    {selectedTask.description || "No description"}
                  </p>
                )}
                {!isPublic && (
                  <p className="mt-2 text-sm font-semibold text-[#8c7569]">
                    Building: {selectedTask.building_label}
                  </p>
                )}
                <p className="mt-2 text-sm font-semibold text-[#8c7569]">
                  Wheather: {getTaskWeatherLabel(selectedTask.weather)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 p-3 sm:p-6 lg:grid-cols-3">
              {!isPublic && (
                <div className="rounded border border-[#e6ddd7] bg-[#f9f6f3] p-4 lg:col-span-1">
                  <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#8c7569]">
                    Status History
                  </h4>
                  <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                    {statusEvents.map((event) => (
                      <div key={event.id} className="rounded bg-white p-2">
                        <p className="text-xs font-semibold text-[#55311c]">
                          {getStatusEventLabel(event.text)}
                        </p>
                        {event.image_data && (
                          <img
                            src={event.image_data}
                            alt="Task completion evidence"
                            className="mt-2 max-h-48 rounded border border-[#ddd]"
                          />
                        )}
                        <div className="mt-1 text-xs text-[rgba(0,0,0,0.55)]">
                          <p>{event.sender_name}</p>
                          <p>{formatTaskEventTimestamp(event.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    {statusEvents.length === 0 && (
                      <p className="text-xs text-[rgba(0,0,0,0.6)]">
                        No status history yet.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className={`space-y-3 ${isPublic ? "lg:col-span-3" : "lg:col-span-2"}`}>
                <h4 className="text-lg font-bold text-[#55311c]">Task Chat</h4>
                {shouldRequireCompletionPhoto &&
                  selectedTask.requires_completion_image &&
                  selectedTask.status !== "done" && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      A completion photo is required to finish this task.
                    </div>
                  )}

                <div className="max-h-[40vh] space-y-3 overflow-y-auto rounded border border-[#e6ddd7] p-3">
                  {messagesLoading && (
                    <p className="text-sm text-[rgba(0,0,0,0.6)]">
                      Loading chat...
                    </p>
                  )}
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="rounded bg-[#f7f2ee] p-3">
                      <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs font-semibold text-[#55311c]">
                          {msg.sender_name} ({msg.sender_role})
                        </span>
                        <span className="text-xs text-[rgba(0,0,0,0.55)]">
                          {new Date(msg.created_at).toLocaleString("en-GB")}
                        </span>
                      </div>
                      {msg.text && (
                        <p className="text-sm text-[rgba(0,0,0,0.78)]">
                          {msg.text}
                        </p>
                      )}
                      {msg.image_data && (
                        <img
                          src={msg.image_data}
                          alt="Task attachment"
                          className="mt-2 max-h-64 rounded border border-[#ddd]"
                        />
                      )}
                    </div>
                  ))}
                  {chatMessages.length === 0 && !messagesLoading && (
                    <p className="text-sm text-[rgba(0,0,0,0.6)]">
                      No messages yet.
                    </p>
                  )}
                </div>

                {isCaretakerTaskLocked ? (
                  <div className="rounded border border-[#e6ddd7] bg-[#f9f6f3] p-3 text-sm text-[rgba(0,0,0,0.7)]">
                    Completed tasks are locked for the caretaker.
                  </div>
                ) : (
                  <div ref={chatComposerRef} className="space-y-2">
                    <div className="relative rounded-[28px] border border-[#d9dce3] bg-[#f2f2f7] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                      <input
                        ref={chatImageInputRef}
                        id="task-chat-image-input"
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleSelectImage(e.target.files?.[0] || null, "chat")
                        }
                        className="hidden"
                      />
                      <label
                        htmlFor="task-chat-image-input"
                        className="absolute bottom-3 left-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#6b7280] transition-all duration-200 hover:bg-white/80 hover:text-[#55311c]"
                        title={
                          shouldRequireCompletionPhoto &&
                          selectedTask.requires_completion_image
                            ? "Select photo"
                            : "Add media"
                        }
                      >
                        <Paperclip className="h-4 w-4" />
                      </label>
                      <textarea
                        ref={chatTextareaRef}
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return
                          if (e.shiftKey) return
                          e.preventDefault()
                          if (!sendMessageMutation.isPending && canSendCurrentMessage) {
                            handleSendMessage()
                          }
                        }}
                        rows={1}
                        placeholder="iMessage-style update..."
                        className="min-h-[56px] w-full resize-none bg-transparent px-14 py-[17px] pr-16 text-[15px] leading-6 text-black placeholder:text-[#8e8e93] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={
                          sendMessageMutation.isPending || !canSendCurrentMessage
                        }
                        className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#007aff] text-white shadow-sm transition-all duration-200 hover:bg-[#0062cc] disabled:cursor-not-allowed disabled:bg-[#b8d8ff]"
                        title="Send message"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-2 text-xs text-[rgba(0,0,0,0.7)]">
                      <span>
                        {chatImageData ? "1 file selected" : "No media selected"}
                      </span>
                    </div>
                    {chatImageData && (
                      <div className="rounded border border-[#ddd] p-2">
                        <img
                          src={chatImageData}
                          alt="Preview"
                          className="max-h-48 rounded border border-[#ddd]"
                        />
                        <button
                          type="button"
                          onClick={() => setChatImageData(null)}
                          className="mt-2 rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-gray-300"
                        >
                          Remove media
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {showCompletionPhotoPrompt && shouldRequireCompletionPhoto && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-4">
                <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
                  <h4 className="text-base font-bold text-[#55311c]">
                    Completion photo required
                  </h4>
                  <p className="mt-2 text-sm text-[rgba(0,0,0,0.72)]">
                    Select a completion photo before marking this task as done.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => chatImageInputRef.current?.click()}
                      className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c]"
                    >
                      Select photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCompletionPhotoPrompt(false)}
                      className="rounded bg-gray-200 px-4 py-2 text-sm font-semibold text-[#55311c] hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tasksLoading && (
        <div className="rounded-lg bg-white p-4 text-sm text-[#55311c] shadow-md">
          Loading tasks...
        </div>
      )}
    </div>
  )
}
