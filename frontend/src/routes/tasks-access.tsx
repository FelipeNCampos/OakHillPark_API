import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { TasksBoard } from "@/components/Tasks/TasksBoard"

const searchSchema = z.object({
  condominioId: z.string().optional().catch(""),
})

export const Route = createFileRoute("/tasks-access" as any)({
  component: TasksAccessPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        title: "Tasks Access - OakHill Park",
      },
    ],
  }),
})

function TasksAccessPage() {
  const search = Route.useSearch() as z.infer<typeof searchSchema>
  const condominioId = search.condominioId || null

  return (
    <div className="mobile-page-shell min-h-screen bg-[#f5f1ee] px-3 py-6 sm:px-4 sm:py-8">
      <TasksBoard
        mode="public"
        publicCondominioId={condominioId}
        title="Tasks"
        subtitle="View open tasks, send updates and move completed items to Done without login."
      />
    </div>
  )
}
