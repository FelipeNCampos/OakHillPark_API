import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { OpenAPI } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"

type TaskStatus = "todo" | "in_progress" | "paused" | "done"
type BoardMode = "manager" | "caretaker"

type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  assigned_to_user_id: string
  assigned_to_name: string
  spent_seconds: number
  created_at: string
  updated_at: string
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
  data: Task[]
  count: number
}

type TaskMessageListResponse = {
  data: TaskMessage[]
  count: number
}

const apiCall = async (
  endpoint: string,
  options?: { method?: string; body?: unknown },
) => {
  const base = OpenAPI.BASE || "http://localhost:8000"
  const response = await fetch(`${base}${endpoint}`, {
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

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const payload = (await response.json()) as { detail?: string; message?: string }
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
  in_progress: "In Progress",
  paused: "Paused",
  done: "Done",
}

const STATUS_EVENT_PREFIX = "[STATUS]"

const formatSpentTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function TasksBoard({ mode }: { mode: BoardMode }) {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const queryClient = useQueryClient()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [chatText, setChatText] = useState("")
  const [chatImageData, setChatImageData] = useState<string | null>(null)

  const isManager = mode === "manager"

  const { data: tasksData, isLoading: tasksLoading } = useQuery<TaskListResponse>({
    queryKey: ["tasks", mode],
    queryFn: () => apiCall("/api/v1/tasks/"),
    refetchInterval: selectedTaskId ? 10000 : 15000,
  })

  const tasks = tasksData?.data || []
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null

  const { data: messagesData, isLoading: messagesLoading } =
    useQuery<TaskMessageListResponse>({
      queryKey: ["task-messages", selectedTaskId],
      queryFn: () => apiCall(`/api/v1/tasks/${selectedTaskId}/messages`),
      enabled: Boolean(selectedTaskId),
      refetchInterval: selectedTaskId ? 8000 : false,
    })

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      paused: [],
      done: [],
    }
    tasks.forEach((task) => {
      groups[task.status].push(task)
    })
    return groups
  }, [tasks])

  const allMessages = messagesData?.data || []

  const statusEvents = useMemo(
    () =>
      allMessages.filter(
        (msg) => Boolean(msg.text) && String(msg.text).startsWith(STATUS_EVENT_PREFIX),
      ),
    [allMessages],
  )

  const chatMessages = useMemo(
    () =>
      allMessages.filter(
        (msg) =>
          !msg.text || !String(msg.text).startsWith(STATUS_EVENT_PREFIX),
      ),
    [allMessages],
  )

  const createTaskMutation = useMutation({
    mutationFn: () =>
      apiCall("/api/v1/tasks/", {
        method: "POST",
        body: {
          title: newTitle.trim(),
          description: newDescription.trim(),
        },
      }),
    onSuccess: () => {
      showSuccessToast("Task criada")
      setNewTitle("")
      setNewDescription("")
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (error: unknown) => {
      showErrorToast(error instanceof Error ? error.message : "Error creating task")
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      apiCall(`/api/v1/tasks/${taskId}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      if (selectedTaskId) {
        queryClient.invalidateQueries({ queryKey: ["task-messages", selectedTaskId] })
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
      apiCall(`/api/v1/tasks/${selectedTaskId}/messages`, {
        method: "POST",
        body: {
          text: chatText.trim() || null,
          image_data: chatImageData,
        },
      }),
    onSuccess: () => {
      setChatText("")
      setChatImageData(null)
      queryClient.invalidateQueries({ queryKey: ["task-messages", selectedTaskId] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (error: unknown) => {
      showErrorToast(error instanceof Error ? error.message : "Error sending message")
    },
  })

  const handleCreateTask = () => {
    if (!newTitle.trim()) {
      showErrorToast("Task title is required")
      return
    }
    createTaskMutation.mutate()
  }

  const handleSelectImage = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setChatImageData(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSendMessage = () => {
    if (!selectedTaskId) return
    if (!chatText.trim() && !chatImageData) {
      showErrorToast("Digite mensagem ou anexe imagem")
      return
    }
    sendMessageMutation.mutate()
  }

  const moveTaskToStatus = (task: Task, nextStatus: TaskStatus) => {
    if (task.status === nextStatus || updateStatusMutation.isPending) return
    updateStatusMutation.mutate({ taskId: task.id, status: nextStatus })
  }

  const handleDropOnColumn = (targetStatus: TaskStatus, taskIdFromDrop?: string) => {
    const droppedTaskId = taskIdFromDrop || draggingTaskId
    if (!droppedTaskId) return
    const task = tasks.find((item) => item.id === droppedTaskId)
    setDraggingTaskId(null)
    if (!task) return
    moveTaskToStatus(task, targetStatus)
  }

  const openTaskPopup = (taskId: string) => {
    setSelectedTaskId(taskId)
    setChatText("")
    setChatImageData(null)
  }

  const closeTaskPopup = () => {
    setSelectedTaskId(null)
    setChatText("")
    setChatImageData(null)
  }

  const renderStatusActions = (task: Task) => {
    if (task.status === "done") return null

    return (
      <div className="mt-3 flex gap-2">
        {task.status !== "in_progress" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              moveTaskToStatus(task, "in_progress")
            }}
            className="rounded bg-[#8c7569] px-2 py-1 text-xs font-semibold text-white hover:bg-[#55311c]"
          >
            Start
          </button>
        )}
        {task.status === "in_progress" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              moveTaskToStatus(task, "paused")
            }}
            className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Pause
          </button>
        )}
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
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          Tasks
        </h2>
      </div>

      {isManager && (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h3 className="mb-3 text-lg font-bold text-[#55311c]">Create task</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              className="rounded border border-[#ddd] px-3 py-2 text-black"
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description"
              className="rounded border border-[#ddd] px-3 py-2 text-black"
            />
          </div>
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

      <div className="grid gap-4 lg:grid-cols-4">
        {(Object.keys(groupedTasks) as TaskStatus[]).map((status) => (
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
              {groupedTasks[status].map((task) => (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
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
                      : "border-[#e6ddd7] bg-white hover:bg-[#faf7f4]"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8c7569]">
                    Spent: {formatSpentTime(task.spent_seconds)}
                  </p>
                  <p className="font-semibold text-[#55311c]">{task.title}</p>
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
                <p className="text-xs text-[rgba(0,0,0,0.55)]">Sem tasks</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-[#e6ddd7] px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-[#55311c]">
                  {selectedTask.title}
                </h3>
                <p className="text-sm text-[rgba(0,0,0,0.7)]">
                  {selectedTask.description || "No description"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeTaskPopup}
                className="rounded bg-gray-200 px-3 py-1 text-sm font-semibold text-[#55311c] hover:bg-gray-300"
              >
                Close
              </button>
            </div>

            <div className="grid max-h-[calc(90vh-78px)] gap-4 overflow-y-auto p-6 lg:grid-cols-3">
              <div className="rounded border border-[#e6ddd7] bg-[#f9f6f3] p-4 lg:col-span-1">
                <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#8c7569]">
                  Status History
                </h4>
                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {statusEvents.map((event) => (
                    <div key={event.id} className="rounded bg-white p-2">
                      <p className="text-xs font-semibold text-[#55311c]">
                        {event.text?.replace(STATUS_EVENT_PREFIX, "").trim()}
                      </p>
                      <p className="mt-1 text-xs text-[rgba(0,0,0,0.55)]">
                        {event.sender_name} •{" "}
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {statusEvents.length === 0 && (
                    <p className="text-xs text-[rgba(0,0,0,0.6)]">
                      No status history yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3 lg:col-span-2">
                <h4 className="text-lg font-bold text-[#55311c]">Task Chat</h4>

                <div className="max-h-[40vh] space-y-3 overflow-y-auto rounded border border-[#e6ddd7] p-3">
                  {messagesLoading && (
                    <p className="text-sm text-[rgba(0,0,0,0.6)]">Loading chat...</p>
                  )}
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="rounded bg-[#f7f2ee] p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#55311c]">
                          {msg.sender_name} ({msg.sender_role})
                        </span>
                        <span className="text-xs text-[rgba(0,0,0,0.55)]">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      {msg.text && (
                        <p className="text-sm text-[rgba(0,0,0,0.78)]">{msg.text}</p>
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
                    <p className="text-sm text-[rgba(0,0,0,0.6)]">Sem mensagens ainda.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <textarea
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return
                      if (e.shiftKey) return
                      e.preventDefault()
                      if (!sendMessageMutation.isPending) {
                        handleSendMessage()
                      }
                    }}
                    rows={3}
                    placeholder="Digite uma mensagem..."
                    className="w-full rounded border border-[#ddd] px-3 py-2 text-black"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="task-chat-image-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSelectImage(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label
                      htmlFor="task-chat-image-input"
                      className="cursor-pointer rounded bg-[#8c7569] px-3 py-2 text-xs font-semibold text-white hover:bg-[#55311c]"
                    >
                      Send media
                    </label>
                    <span className="text-xs text-[rgba(0,0,0,0.7)]">
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
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={sendMessageMutation.isPending}
                    className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c] disabled:opacity-60"
                  >
                    {sendMessageMutation.isPending ? "Sending..." : "Send message"}
                  </button>
                </div>
              </div>
            </div>
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
