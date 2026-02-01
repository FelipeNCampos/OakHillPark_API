import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { isLoggedIn } from "@/hooks/useAuth"
import useAuth from "@/hooks/useAuth"
import { useQuery } from "@tanstack/react-query"
import { OpenAPI } from "@/client"

// Wrapper para chamar a API diretamente enquanto o cliente não é regenerado
const apiCall = async (endpoint: string, params?: Record<string, any>) => {
  const url = new URL(`${OpenAPI.BASE || "http://localhost:8000"}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value))
      }
    })
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("access_token")}`,
    },
  })
  if (!response.ok) throw new Error("API call failed")
  return response.json()
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
        return <BuildingsReadingsContent />
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
          <div className="flex items-center justify-between px-6 py-4">
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            {/* Center: Logo and Title */}
            <div className="flex flex-1 items-center justify-center gap-3">
              <h1 className="font-['Nunito',sans-serif] text-2xl font-bold text-[#55311c]">
                OakHill Park
              </h1>
            </div>

            {/* Right: User Info and Logout */}
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

function BuildingsReadingsContent() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const {
    data: buildingsData,
    isLoading: buildingsLoading,
    error: buildingsError,
  } = useQuery({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/"),
  })

  const buildings = buildingsData?.data || []

  // Set first building as selected if available
  useEffect(() => {
    if (buildings.length > 0 && !selectedBuildingId) {
      setSelectedBuildingId(buildings[0].id)
    }
  }, [buildings.length, selectedBuildingId])

  if (buildingsLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Carregando buildings...</p>
        </div>
      </div>
    )
  }

  if (buildingsError || !buildings.length) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Nenhum building encontrado</p>
        </div>
      </div>
    )
  }

  const selectedBuilding = buildings.find((b: any) => b.id === selectedBuildingId)

  if (showForm) {
    return <AddReadingsForm buildings={buildings} onBack={() => setShowForm(false)} />
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Buildings - Readings
          </h2>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
            type="button"
          >
            <svg
              className="h-5 w-5"
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
            Reading
          </button>
        </div>

        {/* Building Navigation */}
        <div className="mb-6">
          <label className="block font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c] mb-3">
            Selecione um Building:
          </label>
          <div className="flex gap-3 w-full">
            {buildings.map((building: any) => (
              <button
                key={building.id}
                onClick={() => setSelectedBuildingId(building.id)}
                className={`flex-1 px-6 py-3 rounded-lg font-['Nunito',sans-serif] font-semibold transition-all duration-200 ${
                  selectedBuildingId === building.id
                    ? 'bg-[#55311c] text-white shadow-lg'
                    : 'bg-[#e8e4e1] text-[#55311c] hover:bg-[#ddd8d5]'
                }`}
                type="button"
              >
                {building.nome}
              </button>
            ))}
          </div>
        </div>

        {selectedBuilding && (
          <BuildingReadingsTable 
            building={selectedBuilding} 
            onPrevious={() => {
              const currentIndex = buildings.findIndex((b: any) => b.id === selectedBuildingId)
              if (currentIndex > 0) {
                setSelectedBuildingId(buildings[currentIndex - 1].id)
              }
            }}
            onNext={() => {
              const currentIndex = buildings.findIndex((b: any) => b.id === selectedBuildingId)
              if (currentIndex < buildings.length - 1) {
                setSelectedBuildingId(buildings[currentIndex + 1].id)
              }
            }}
            hasPrevious={buildings.findIndex((b: any) => b.id === selectedBuildingId) > 0}
            hasNext={buildings.findIndex((b: any) => b.id === selectedBuildingId) < buildings.length - 1}
          />
        )}
      </div>
    </div>
  )
}

function BuildingReadingsTable({ 
  building, 
  onPrevious, 
  onNext, 
  hasPrevious, 
  hasNext 
}: { 
  building: any
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
}) {
  const {
    data: readingsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["readings", building.id],
    queryFn: () =>
      apiCall("/api/v1/readings/", {
        skip: 0,
        limit: 1000,
        building_id: building.id,
      }),
  })

  const readings = (readingsData?.data || []) as any[]

  // Determine which types this building has (bitmask: 1=Low, 2=Normal, 4=Gas)
  const hasLow = (building.reading_types & 1) !== 0
  const hasNormal = (building.reading_types & 2) !== 0
  const hasGas = (building.reading_types & 4) !== 0

  if (isLoading) {
    return <p className="text-center text-[#55311c]">Carregando readings...</p>
  }

  if (error || !readings.length) {
    return (
      <p className="text-center text-[#55311c]">
        Nenhuma leitura encontrada para este building
      </p>
    )
  }

  // Define interface for grouped readings
  interface ReadingByDate {
    date: string
    low?: number
    normal?: number
    gas?: number
  }

  // Group readings by date
  const readingsByDate: Record<string, ReadingByDate> = {}
  for (const reading of readings) {
    const date = new Date(reading.data).toISOString().split("T")[0]
    if (!readingsByDate[date]) {
      readingsByDate[date] = { date: reading.data, low: undefined, normal: undefined, gas: undefined }
    }
    if (reading.tipo === 1) readingsByDate[date].low = reading.valor
    if (reading.tipo === 2) readingsByDate[date].normal = reading.valor
    if (reading.tipo === 4) readingsByDate[date].gas = reading.valor
  }

  // Convert to array and sort by date (newest first)
  const sortedReadings: ReadingByDate[] = Object.values(readingsByDate).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
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

  const processedData: ProcessedReading[] = sortedReadings.map((current, index) => {
    const previous: ReadingByDate | undefined = sortedReadings[index + 1]
    const currentDate = new Date(current.date)
    
    let days = 0
    if (previous) {
      const prevDate = new Date(previous.date)
      days = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
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
        result.lowPercent = previous.low !== 0 
          ? ((result.lowUsed / previous.low) * 100).toFixed(2)
          : "0.00"
      }
    }

    // Calculate Normal values
    if (hasNormal && current.normal !== undefined) {
      result.normal = current.normal
      if (previous && previous.normal !== undefined) {
        result.normalUsed = current.normal - previous.normal
        result.normalPercent = previous.normal !== 0
          ? ((result.normalUsed / previous.normal) * 100).toFixed(2)
          : "0.00"
      }
    }

    // Calculate Gas values
    if (hasGas && current.gas !== undefined) {
      result.gas = current.gas
      if (previous && previous.gas !== undefined) {
        result.gasUsed = current.gas - previous.gas
        result.gasPercent = previous.gas !== 0
          ? ((result.gasUsed / previous.gas) * 100).toFixed(2)
          : "0.00"
      }
    }

    return result
  })

  // Get color class based on percentage value
  const getPercentColor = (percent: string | undefined) => {
    if (!percent) return ""
    const value = parseFloat(percent)
    if (value < 0) return "bg-green-200" // Economy
    if (value > 20) return "bg-red-200" // High consumption
    if (value > 10) return "bg-orange-100" // Medium-high consumption
    return "bg-yellow-50" // Normal consumption
  }

  return (
    <div className="overflow-x-auto">
      {/* Building Header */}
      <div className="mb-4 rounded-t-lg bg-[#2d8659] p-4 text-white relative">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          disabled={!hasPrevious}
          className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-200 ${
            hasPrevious 
              ? 'bg-white/20 hover:bg-white/30 cursor-pointer' 
              : 'bg-white/10 cursor-not-allowed opacity-50'
          }`}
          type="button"
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Building Info */}
        <div className="text-center">
          <h3 className="text-2xl font-bold font-['Nunito',sans-serif]">
            {building.nome}
          </h3>
          <div className="mt-2 flex items-center justify-center gap-6 text-sm">
            <p>Electricity S/N: {building.electricity_sn || 'N/A'}</p>
            {building.gas_sn && <p>Gas S/N: {building.gas_sn}</p>}
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-200 ${
            hasNext 
              ? 'bg-white/20 hover:bg-white/30 cursor-pointer' 
              : 'bg-white/10 cursor-not-allowed opacity-50'
          }`}
          type="button"
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      <table className="w-full border-collapse">
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
          </tr>
        </thead>
        <tbody>
          {/* "All" row with initial values */}
          <tr className="bg-white hover:bg-gray-50">
            <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800 font-semibold">
              All
            </td>
            <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
              {processedData.length > 0
                ? new Date(processedData[processedData.length - 1].date).toLocaleDateString("en-GB")
                : "-"}
            </td>
            {hasLow && (
              <>
                <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                  {processedData.length > 0 && processedData[processedData.length - 1].low !== undefined
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
                  {processedData.length > 0 && processedData[processedData.length - 1].normal !== undefined
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
                  {processedData.length > 0 && processedData[processedData.length - 1].gas !== undefined
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
          </tr>

          {/* Data rows */}
          {processedData.slice(0, -1).map((row: any, index: number) => (
            <tr
              key={index}
              className={`${
                index % 2 === 0 ? "bg-white" : "bg-gray-50"
              } hover:bg-gray-100 transition-colors duration-150`}
            >
              <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                {row.days || "-"}
              </td>
              <td className="border border-gray-400 px-3 py-2 font-['Nunito',sans-serif] text-sm text-gray-800">
                {new Date(row.date).toLocaleDateString("en-GB")}
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
                      row.lowPercent
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
                      row.normalPercent
                    )}`}
                  >
                    {row.normalPercent !== undefined ? row.normalPercent : "no data"}
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
                      row.gasPercent
                    )}`}
                  >
                    {row.gasPercent !== undefined ? row.gasPercent : "no data"}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AddReadingsForm({ buildings, onBack }: { buildings: any[]; onBack: () => void }) {
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize form data with building IDs
  useEffect(() => {
    const initialData: Record<string, Record<string, string>> = {}
    buildings.forEach((building: any) => {
      initialData[building.id] = {}
      const hasLow = (building.reading_types & 1) !== 0
      const hasNormal = (building.reading_types & 2) !== 0
      const hasGas = (building.reading_types & 4) !== 0

      if (hasLow) initialData[building.id].low = ""
      if (hasNormal) initialData[building.id].normal = ""
      if (hasGas) initialData[building.id].gas = ""
    })
    setFormData(initialData)
  }, [buildings])

  const handleInputChange = (buildingId: string, type: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [buildingId]: {
        ...prev[buildingId],
        [type]: value,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const readings: any[] = []
      
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
        await fetch(`${OpenAPI.BASE || "http://localhost:8000"}/api/v1/readings/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
          body: JSON.stringify(reading),
        })
      }

      alert("Readings cadastradas com sucesso!")
      onBack()
    } catch (error) {
      console.error("Error submitting readings:", error)
      alert("Erro ao cadastrar readings")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Adicionar Readings
          </h2>
          <button
            onClick={onBack}
            className="rounded-lg bg-gray-500 px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-gray-600"
            type="button"
          >
            Voltar
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {buildings.map((building: any) => {
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
                        <label className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]">
                          Low
                        </label>
                        <input
                          type="number"
                          value={formData[building.id]?.low || ""}
                          onChange={(e) =>
                            handleInputChange(building.id, "low", e.target.value)
                          }
                          className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                          placeholder="Valor Low"
                        />
                      </div>
                    )}

                    {hasNormal && (
                      <div>
                        <label className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]">
                          Normal
                        </label>
                        <input
                          type="number"
                          value={formData[building.id]?.normal || ""}
                          onChange={(e) =>
                            handleInputChange(building.id, "normal", e.target.value)
                          }
                          className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                          placeholder="Valor Normal"
                        />
                      </div>
                    )}

                    {hasGas && (
                      <div>
                        <label className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]">
                          Gas
                        </label>
                        <input
                          type="number"
                          value={formData[building.id]?.gas || ""}
                          onChange={(e) =>
                            handleInputChange(building.id, "gas", e.target.value)
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
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#8c7569] px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
            >
              {isSubmitting ? "Salvando..." : "Salvar Readings"}
            </button>
          </div>
        </form>
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


