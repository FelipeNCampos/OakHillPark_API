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
  const { data: me, isLoading, isError } = useQuery({
    queryKey: ["currentUser", "caretaker"],
    queryFn: UsersService.readUserMe,
  })

  const logout = () => {
    localStorage.removeItem("access_token")
    window.location.href = "/caretaker-login"
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f1ee] p-8">
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
    <div className="min-h-screen bg-[#f5f1ee] p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between rounded-lg bg-white p-4 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-[#55311c]">Caretaker Tasks</h1>
            <p className="text-sm text-[rgba(0,0,0,0.65)]">{me.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white hover:bg-[#55311c]"
          >
            Sign out
          </button>
        </div>
        <TasksBoard mode="caretaker" />
      </div>
    </div>
  )
}
