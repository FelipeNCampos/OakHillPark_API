import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    readings: true,
    qrCodes: true,
  })

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

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }))
  }

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
      ],
    },
  ]

  const standaloneItems = [
    { label: "Residents", id: "residents" },
    { label: "Cleaner", id: "cleaner" },
    { label: "Caretaker", id: "caretaker" },
    { label: "Bins", id: "bins" },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewContent user={user} />
      case "buildings":
        return <TabContent title="Buildings" />
      case "flats":
        return <TabContent title="Flats" />
      case "qr-cleaner":
        return <TabContent title="QR Code - Cleaner" />
      case "qr-contractor":
        return <TabContent title="QR Code - Contractor" />
      case "qr-caretaker":
        return <TabContent title="QR Code - Caretaker" />
      case "residents":
        return <TabContent title="Residents" />
      case "cleaner":
        return <TabContent title="Cleaner" />
      case "caretaker":
        return <TabContent title="Caretaker" />
      case "bins":
        return <TabContent title="Bins" />
      default:
        return <OverviewContent user={user} />
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f5f1ee]">
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
                        className={`block w-full rounded-lg px-4 py-2 text-left font-['Nunito',sans-serif] text-sm transition-all duration-200 ${
                          activeTab === item.id
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
                  className={`w-full rounded-lg px-4 py-2 text-left font-['Nunito',sans-serif] text-sm font-semibold transition-all duration-200 ${
                    activeTab === item.id
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
          <div className="flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
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

        {/* Page Content */}
        <main className="flex-1 overflow-auto px-6 py-8">
          {renderContent()}
        </main>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

function OverviewContent({ user }: { user: any }) {
  return (
    <div className="mx-auto max-w-7xl">
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
    </div>
  )
}

function TabContent({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          {title}
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          Conteúdo de {title} será exibido aqui.
        </p>
      </div>
    </div>
  )
}

