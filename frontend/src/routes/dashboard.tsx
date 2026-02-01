import { createFileRoute, redirect } from "@tanstack/react-router"
import { isLoggedIn } from "@/hooks/useAuth"
import useAuth from "@/hooks/useAuth"

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

  // Verifica se o usuário não é superuser
  if (user?.is_superuser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f1ee]">
        <div className="rounded-lg bg-white p-8 text-center shadow-lg">
          <h1 className="mb-4 text-2xl font-bold text-[#55311c]">
            Acesso Negado
          </h1>
          <p className="mb-6 text-[rgba(0,0,0,0.7)]">
            Esta área é exclusiva para gerentes.
          </p>
          <button
            onClick={logout}
            className="rounded bg-[#8c7569] px-6 py-2 text-white transition-all duration-300 hover:bg-[#55311c]"
            type="button"
          >
            Voltar ao Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f1ee]">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <img
              src="/assets/images/menu.png"
              alt="OakHill Park Logo"
              className="h-12 w-12"
            />
            <h1 className="font-['Nunito',sans-serif] text-2xl font-bold text-[#55311c]">
              OakHill Park
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-[#55311c]">
                {user?.full_name || "Gerente"}
              </p>
              <p className="text-xs text-[rgba(0,0,0,0.6)]">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              className="rounded bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm text-white transition-all duration-300 hover:bg-[#55311c]"
              type="button"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8 rounded-lg bg-white p-8 shadow-md">
          <h2 className="mb-2 font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Bem-vindo, {user?.full_name || "Gerente"}!
          </h2>
          <p className="text-[rgba(0,0,0,0.7)]">
            Gerencie todas as operações do condomínio em um só lugar.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-['Nunito',sans-serif] text-sm font-semibold uppercase tracking-wide text-[#8c7569]">
                Unidades
              </h3>
              <svg
                className="h-8 w-8 text-[#8c7569]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-[#55311c]">--</p>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">Total de apartamentos</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-['Nunito',sans-serif] text-sm font-semibold uppercase tracking-wide text-[#8c7569]">
                Moradores
              </h3>
              <svg
                className="h-8 w-8 text-[#8c7569]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-[#55311c]">--</p>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">Cadastrados</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-['Nunito',sans-serif] text-sm font-semibold uppercase tracking-wide text-[#8c7569]">
                Avisos
              </h3>
              <svg
                className="h-8 w-8 text-[#8c7569]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-[#55311c]">--</p>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">Pendentes</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md transition-all duration-300 hover:shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-['Nunito',sans-serif] text-sm font-semibold uppercase tracking-wide text-[#8c7569]">
                Reservas
              </h3>
              <svg
                className="h-8 w-8 text-[#8c7569]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-[#55311c]">--</p>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">Este mês</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-lg bg-white p-8 shadow-md">
          <h3 className="mb-6 font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
            Ações Rápidas
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border border-[#ddd] p-4 transition-all duration-300 hover:border-[#8c7569] hover:bg-[#f9f7f5]"
            >
              <svg
                className="h-6 w-6 text-[#8c7569]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="font-['Nunito',sans-serif] font-semibold text-[#55311c]">
                Novo Aviso
              </span>
            </button>

            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border border-[#ddd] p-4 transition-all duration-300 hover:border-[#8c7569] hover:bg-[#f9f7f5]"
            >
              <svg
                className="h-6 w-6 text-[#8c7569]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="font-['Nunito',sans-serif] font-semibold text-[#55311c]">
                Relatórios
              </span>
            </button>

            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border border-[#ddd] p-4 transition-all duration-300 hover:border-[#8c7569] hover:bg-[#f9f7f5]"
            >
              <svg
                className="h-6 w-6 text-[#8c7569]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="font-['Nunito',sans-serif] font-semibold text-[#55311c]">
                Configurações
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
