import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { UsersService } from "@/client"
import { TasksBoard } from "@/components/Tasks/TasksBoard"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/caretaker-tasks" as any)({
  component: CaretakerTasksPage,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/caretaker-login" as any })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Caretaker Tasks - OakHill Park",
      },
    ],
  }),
})

function CaretakerTasksPage() {
  const {
    data: me,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["currentUser", "caretaker"],
    queryFn: UsersService.readUserMe,
  })

  const logout = () => {
    localStorage.removeItem("access_token")
    window.location.href = "/caretaker-login"
  }

  if (isLoading) {
    return (
      <div className="dashboard-mobile-root min-h-screen bg-[#f5f1ee] p-4 sm:p-8">
        <div className="mx-auto max-w-5xl rounded-lg bg-white p-6 shadow-md">
          Loading...
        </div>
      </div>
    )
  }

  if (isError || !me || me.cargo !== 1 || me.is_superuser) {
    logout()
    return null
  }

  return (
    <div className="dashboard-mobile-root min-h-screen bg-[#f5f1ee] p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-lg bg-white p-4 shadow-md sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-bold text-[#55311c] sm:text-2xl">
              Caretaker Tasks
            </h1>
            <p className="text-sm text-[rgba(0,0,0,0.65)]">{me.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c] sm:w-auto"
          >
            Sign out
          </button>
        </div>
        <TasksBoard mode="caretaker" />
      </div>
    </div>
  )
}
