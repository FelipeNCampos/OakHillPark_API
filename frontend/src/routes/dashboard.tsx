import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"
import { OpenAPI } from "@/client"
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

interface Morador {
  id: EntityId
  building_nome: string
  flat_numero: number
  nome: string
  mobile?: string | number | null
  reading_types: number
}

interface MoradorDetail {
  nome: string
  email?: string | null
  mobile?: string | number | null
  cargo: number
  car1?: string | null
  car2?: string | null
  car3?: string | null
  flat_id: EntityId
}

interface NewReadingPayload {
  building_id?: EntityId
  flat_id?: EntityId
  tipo: number
  valor: number
  data?: string
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

// Wrapper para chamar a API diretamente enquanto o cliente não é regenerado
const apiCall = async (
  endpoint: string,
  params?: ApiQueryParams | ApiRequestOptions,
) => {
  const url = new URL(`${OpenAPI.BASE || "http://localhost:8000"}${endpoint}`)
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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {
      readings: true,
      qrCodes: true,
    },
  )

  // Verifica se o usuário é gerente ou superior (cargo >= 1)
  if (!user || (user.cargo ?? 0) < 1) {
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
    { label: "Twillio", id: "twillio" },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewContent user={user} />
      case "buildings":
        return <BuildingsReadingsContent />
      case "flats":
        return <FlatsReadingsContent />
      case "qr-cleaner":
        return <CleanerQrCodesContent />
      case "qr-contractor":
        return <TabContent title="QR Code - Contractor" />
      case "qr-caretaker":
        return <CaretakerQrCodesContent />
      case "residents":
        return <ResidentsContent />
      case "cleaner":
        return <CleanerContent />
      case "caretaker":
        return <CaretakerContent />
      case "bins":
        return <TabContent title="Bins" />
      case "twillio":
        return <TabContent title="Twillio" />
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
                  type="button"
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

function OverviewContent({ user }: { user: UserProfile }) {
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
              <title>Unidades</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <p className="text-3xl font-bold text-[#55311c]">--</p>
          <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">
            Total de apartamentos
          </p>
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
              <title>Moradores</title>
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
              <title>Avisos</title>
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
              <title>Reservas</title>
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
  const [selectedBuildingId, setSelectedBuildingId] = useState<EntityId | null>(
    null,
  )
  const [showForm, setShowForm] = useState(false)

  const {
    data: buildingsData,
    isLoading: buildingsLoading,
    error: buildingsError,
  } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = buildingsData?.data || []

  // Set first building as selected if available
  const firstBuildingId = buildings[0]?.id

  useEffect(() => {
    if (firstBuildingId !== undefined && !selectedBuildingId) {
      setSelectedBuildingId(firstBuildingId)
    }
  }, [firstBuildingId, selectedBuildingId])

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
              <title>Adicionar leitura</title>
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
          <p className="block font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c] mb-3">
            Selecione um Building:
          </p>
          <div className="flex gap-3 w-full">
            {[...buildings]
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map((building) => (
                <button
                  key={building.id}
                  onClick={() => setSelectedBuildingId(building.id)}
                  className={`flex-1 px-6 py-3 rounded-lg font-['Nunito',sans-serif] font-semibold transition-all duration-200 ${
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

        {selectedBuilding && (
          <BuildingReadingsTable
            building={selectedBuilding}
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
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  building: Building
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
          // Calculate percentage: (used atual * 100) / used anterior
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
          // Calculate percentage: (used atual * 100) / used anterior
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
          // Calculate percentage: (used atual * 100) / used anterior
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
        showErrorToast("Nenhuma alteração detectada")
        return
      }

      await Promise.all(updates)
      showSuccessToast("Leituras atualizadas com sucesso")
      queryClient.invalidateQueries({ queryKey: ["readings", building.id] })
      setEditingRow(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao atualizar leituras"
      showErrorToast(message)
    }
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
            <title>Building anterior</title>
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
            <p>Electricity S/N: {building.electricity_sn || "N/A"}</p>
            {building.gas_sn && <p>Gas S/N: {building.gas_sn}</p>}
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-200 ${
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
            <title>Proximo building</title>
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
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Ações
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
                  Editar
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
              -
            </td>
          </tr>
        </tbody>
      </table>

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#55311c]">
              Editar leituras
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Data: {editingRow.date.split("T")[0]}
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="edit-reading-date"
                >
                  Data
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

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Salvar
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

      showSuccessToast("Readings cadastradas com sucesso!")
      onBack()
    } catch (error) {
      console.error("Error submitting readings:", error)
      showErrorToast("Erro ao cadastrar readings")
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
              Adicionar Flat Readings
            </h2>
            <button
              onClick={onBack}
              className="rounded-lg bg-gray-500 px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-300 hover:bg-gray-600"
              type="button"
            >
              Voltar
            </button>
          </div>
          <p className="text-[#55311c] font-['Nunito',sans-serif]">
            Nenhum flat com readings configurados encontrado
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
            Adicionar Flat Readings
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
                            Flat {flat.numero}
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

function FlatsReadingsContent() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<EntityId | null>(
    null,
  )
  const [selectedFlatId, setSelectedFlatId] = useState<EntityId | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: buildingsData, isLoading: buildingsLoading } = useQuery<
    ApiListResponse<Building>
  >({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = buildingsData?.data || []
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

  if (buildingsLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Carregando buildings...</p>
        </div>
      </div>
    )
  }

  if (!buildings.length) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Nenhum building encontrado</p>
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
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Flats - Readings
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
              <title>Adicionar leitura</title>
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
            Selecione um Building:
          </p>
          <div className="flex gap-3 w-full">
            {[...buildings]
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map((building) => (
                <button
                  key={building.id}
                  onClick={() => setSelectedBuildingId(building.id)}
                  className={`flex-1 px-6 py-3 rounded-lg font-['Nunito',sans-serif] font-semibold transition-all duration-200 ${
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

        {/* Flat Selection */}
        {selectedBuildingId && (
          <div className="mb-6">
            <p className="block font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c] mb-3">
              Selecione um Flat:
            </p>
            {flats.length > 0 ? (
              <div className="flex gap-3 w-full flex-wrap">
                {[...flats]
                  .sort((a, b) => a.numero - b.numero)
                  .map((flat) => (
                    <button
                      key={flat.id}
                      onClick={() => setSelectedFlatId(flat.id)}
                      className={`px-6 py-3 rounded-lg font-['Nunito',sans-serif] font-semibold transition-all duration-200 ${
                        selectedFlatId === flat.id
                          ? "bg-[#55311c] text-white shadow-lg"
                          : "bg-[#e8e4e1] text-[#55311c] hover:bg-[#ddd8d5]"
                      }`}
                      type="button"
                    >
                      Flat {flat.numero}
                    </button>
                  ))}
              </div>
            ) : (
              <div className="rounded-lg bg-[#f5f1ee] p-4">
                <p className="text-[#55311c] font-['Nunito',sans-serif]">
                  Nenhum flat com readings configurados neste building
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

  if (isLoading) {
    return <p className="text-center text-[#55311c]">Carregando readings...</p>
  }

  if (error || !readings.length) {
    return (
      <p className="text-center text-[#55311c]">
        Nenhuma leitura encontrada para este flat
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
          // Calculate percentage: (used atual * 100) / used anterior
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
          // Calculate percentage: (used atual * 100) / used anterior
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
          // Calculate percentage: (used atual * 100) / used anterior
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
        showErrorToast("Nenhuma alteração detectada")
        return
      }

      await Promise.all(updates)
      showSuccessToast("Leituras atualizadas com sucesso")
      queryClient.invalidateQueries({ queryKey: ["flat_readings", flat.id] })
      setEditingRow(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao atualizar leituras"
      showErrorToast(message)
    }
  }

  return (
    <div className="overflow-x-auto">
      {/* Flat Header */}
      <div className="mb-4 rounded-t-lg bg-[#2d8659] p-4 text-white relative">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          disabled={!hasPrevious}
          className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-200 ${
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
            <title>Flat anterior</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Flat Info */}
        <div className="text-center">
          <h3 className="text-2xl font-bold font-['Nunito',sans-serif]">
            Flat {flat.numero}
          </h3>
          <p className="text-sm mt-1">
            Building: {flat.building?.nome || "N/A"}
          </p>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-200 ${
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
            <title>Proximo flat</title>
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
            <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
              Acoes
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
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#55311c]">
              Editar leituras
            </h3>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              Data: {editingRow.date.split("T")[0]}
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label
                  className="block text-sm font-semibold text-[#55311c]"
                  htmlFor="edit-flat-reading-date"
                >
                  Data
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

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabContent({ title }: { title: string }) {
  if (title === "Cleaner") {
    return <CleanerContent />
  }

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
          Baixe um QR Code por building para registrar acesso no painel Cleaner.
        </p>
      </div>

      {(isLoading || isGenerating) && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Gerando QR Codes...
        </div>
      )}

      {!isLoading && buildings.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Nenhum building encontrado.
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
                QR Code indisponível
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
                Baixar QR Code
              </a>
              {qrItem?.link && (
                <p className="break-all text-xs text-[rgba(0,0,0,0.5)]">
            {qrItem.link}
                </p>
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
          const link = `${baseUrl}/caretaker-access?${params.toString()}`
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
          QR Code - Caretaker
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          Baixe um QR Code por building para registrar acesso no painel Caretaker.
        </p>
      </div>

      {(isLoading || isGenerating) && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Gerando QR Codes...
        </div>
      )}

      {!isLoading && buildings.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Nenhum building encontrado.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[...buildings].filter((building) => building.nome.toLowerCase().includes("office")).map((building) => {
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
                  Código: {building.id}
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
                    QR Code indisponível
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
                    Baixar QR Code
                  </a>
                  {qrItem?.link && (
                    <p className="break-all text-xs text-[rgba(0,0,0,0.5)]">
                      {qrItem.link}
                    </p>
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

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Cleaner
            </h2>
            <p className="mt-1 text-[rgba(0,0,0,0.7)]">
              Resumo de trabalho e cadastro de cleaners.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab("summary")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                activeSubTab === "summary"
                  ? "bg-[#8c7569] text-white"
                  : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
              }`}
            >
              Resumo
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
              Cadastro
            </button>
          </div>
        </div>
      </div>

      {activeSubTab === "summary" ? <CleanerSummary /> : <CleanerRegister />}
    </div>
  )
}


function CaretakerContent() {
  const [activeSubTab, setActiveSubTab] = useState<"summary" | "register">(
    "summary",
  )

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
              Caretaker
            </h2>
            <p className="mt-1 text-[rgba(0,0,0,0.7)]">
              Resumo de trabalho e cadastro de caretakers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab("summary")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                activeSubTab === "summary"
                  ? "bg-[#8c7569] text-white"
                  : "bg-[#f5f1ee] text-[#55311c] hover:bg-[#e8e1dc]"
              }`}
            >
              Resumo
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
              Cadastro
            </button>
          </div>
        </div>
      </div>

      {activeSubTab === "summary" ? (
        <CaretakerSummary />
      ) : (
        <CaretakerRegister />
      )}
    </div>
  )
}

function CleanerSummary() {
  const { data: cleanersData } = useQuery<ApiListResponse<Funcionario>>({
    queryKey: ["funcionarios", "cleaners-summary"],
    queryFn: () => apiCall("/api/v1/funcionarios/", { skip: 0, limit: 500 }),
  })

  const { data: acessData, isLoading: isLoadingAcess } = useQuery<
    ApiListResponse<AcessRecord>
  >({
    queryKey: ["acess", "cleaner"],
    queryFn: () => apiCall("/api/v1/acess/", { skip: 0, limit: 200 }),
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings", "cleaner-summary"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const acesses = (acessData?.data || []) as AcessRecord[]
  const buildings = (buildingsData?.data || []) as Building[]

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

    return result.reverse().slice(0, 20)
  }, [acesses, activeCleanerId])

  const formatDate = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleDateString("pt-BR")
  }

  const formatTime = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleTimeString("pt-BR", {
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

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
          Resumo de trabalho
        </h3>
        {!activeCleanerId && (
          <span className="rounded-full bg-[#f5f1ee] px-3 py-1 text-xs font-semibold text-[#55311c]">
            Selecione um cleaner ativo no cadastro
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Data
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
            {isLoadingAcess && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={5}
                >
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoadingAcess && sessions.length === 0 && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={5}
                >
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {sessions.map((session, index) => {
              const buildingId =
                session.inRecord?.building_id || session.outRecord?.building_id
              const buildingLabel =
                (buildingId && buildingMap.get(buildingId)) ||
                session.inRecord?.building_nome ||
                session.outRecord?.building_nome ||
                "-"
              const dateLabel = formatDate(
                session.inRecord?.data || session.outRecord?.data,
              )

              return (
                <tr
                  key={`${session.inRecord?.id || "in"}-${session.outRecord?.id || "out"}-${index}`}
                  className="bg-white hover:bg-gray-50"
                >
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {dateLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {buildingLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatTime(session.inRecord?.data)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatTime(session.outRecord?.data)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatUsed(
                      session.inRecord?.data,
                      session.outRecord?.data,
                    )}
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
      showSuccessToast("Cleaner cadastrado com sucesso")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "cleaners"] })
      setShowForm(false)
      setNome("")
      setEmail("")
      setMobile("")
    },
    onError: () => {
      showErrorToast("Não foi possível cadastrar o cleaner")
    },
  })

  const setDefaultCleanerMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/funcionarios/${id}`, {
        method: "PATCH",
        body: { is_default: true },
      }),
    onSuccess: () => {
      showSuccessToast("Cleaner padrão atualizado")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "cleaners"] })
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "cleaners-summary"],
      })
    },
    onError: () => {
      showErrorToast("Não foi possível atualizar o cleaner padrão")
    },
  })

  const handleSetActive = (cleaner: Funcionario) => {
    setDefaultCleanerMutation.mutate(cleaner.id)
  }

  const handleCreateCleaner = () => {
    if (!nome.trim()) {
      showErrorToast("Informe o nome")
      return
    }

    if (!user?.condominio_id) {
      showErrorToast("Usuário não está associado a um condomínio")
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
          Cadastro de cleaners
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
            <title>Adicionar cleaner</title>
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
                Nome
              </label>
              <input
                type="text"
                id="cleaner-name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Nome do cleaner"
              />
            </div>
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="cleaner-email"
              >
                Email (opcional)
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
                Telefone
              </label>
              <input
                type="tel"
                id="cleaner-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Telefone"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateCleaner}
              className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Nome
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Email
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Telefone
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Ativo
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
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoading && cleaners.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  Nenhum cleaner cadastrado.
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
                    {activeCleanerId === cleaner.id ? "Ativo" : "Marcar ativo"}
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

function CaretakerSummary() {
  const { data: caretakersData } = useQuery<ApiListResponse<Funcionario>>({
    queryKey: ["funcionarios", "caretakers-summary"],
    queryFn: () => apiCall("/api/v1/funcionarios/", { skip: 0, limit: 500 }),
  })

  const { data: acessData, isLoading: isLoadingAcess } = useQuery<
    ApiListResponse<AcessRecord>
  >({
    queryKey: ["acess", "caretaker"],
    queryFn: () => apiCall("/api/v1/acess/", { skip: 0, limit: 200 }),
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings", "caretaker-summary"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const acesses = (acessData?.data || []) as AcessRecord[]
  const buildings = (buildingsData?.data || []) as Building[]

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

  const sessions = useMemo(() => {
    const sorted = [...acesses]
      .filter((record) => record?.data)
      .sort(
        (a, b) =>
          new Date(a.data ?? 0).getTime() - new Date(b.data ?? 0).getTime(),
      )

    const filtered = activeCaretakerId
      ? sorted.filter(
          (record) =>
            record.funcionario_id === activeCaretakerId ||
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

    return result.reverse().slice(0, 20)
  }, [acesses, activeCaretakerId])

  const formatDate = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleDateString("pt-BR")
  }

  const formatTime = (dateValue?: string | null) => {
    if (!dateValue) return "-"
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleTimeString("pt-BR", {
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

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
          Resumo de trabalho
        </h3>
        {!activeCaretakerId && (
          <span className="rounded-full bg-[#f5f1ee] px-3 py-1 text-xs font-semibold text-[#55311c]">
            Selecione um caretaker ativo no cadastro
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left font-['Nunito',sans-serif] text-sm font-bold text-gray-700">
                Data
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
            {isLoadingAcess && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={5}
                >
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoadingAcess && sessions.length === 0 && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={5}
                >
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {sessions.map((session, index) => {
              const buildingId =
                session.inRecord?.building_id || session.outRecord?.building_id
              const buildingLabel =
                (buildingId && buildingMap.get(buildingId)) ||
                session.inRecord?.building_nome ||
                session.outRecord?.building_nome ||
                "-"
              const dateLabel = formatDate(
                session.inRecord?.data || session.outRecord?.data,
              )

              return (
                <tr
                  key={`${session.inRecord?.id || "in"}-${session.outRecord?.id || "out"}-${index}`}
                  className="bg-white hover:bg-gray-50"
                >
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {dateLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {buildingLabel}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatTime(session.inRecord?.data)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatTime(session.outRecord?.data)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-sm text-gray-700">
                    {formatUsed(
                      session.inRecord?.data,
                      session.outRecord?.data,
                    )}
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
      showSuccessToast("Caretaker cadastrado com sucesso")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "caretakers"] })
      setShowForm(false)
      setNome("")
      setEmail("")
      setMobile("")
    },
    onError: () => {
      showErrorToast("Não foi possível cadastrar o caretaker")
    },
  })

  const setDefaultCaretakerMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/funcionarios/${id}`, {
        method: "PATCH",
        body: { is_default: true },
      }),
    onSuccess: () => {
      showSuccessToast("Caretaker padrão atualizado")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "caretakers"] })
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "caretakers-summary"],
      })
    },
    onError: () => {
      showErrorToast("Não foi possível atualizar o caretaker padrão")
    },
  })

  const handleSetActive = (caretaker: Funcionario) => {
    setDefaultCaretakerMutation.mutate(caretaker.id)
  }

  const handleCreateCaretaker = () => {
    if (!nome.trim()) {
      showErrorToast("Informe o nome")
      return
    }

    if (!user?.condominio_id) {
      showErrorToast("Usuário não está associado a um condomínio")
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
          Cadastro de caretakers
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
            <title>Adicionar caretaker</title>
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
                Nome
              </label>
              <input
                type="text"
                id="caretaker-name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Nome do caretaker"
              />
            </div>
            <div>
              <label
                className="block text-sm font-semibold text-[#55311c] mb-1"
                htmlFor="caretaker-email"
              >
                Email (opcional)
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
                Telefone
              </label>
              <input
                type="tel"
                id="caretaker-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Telefone"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateCaretaker}
              className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Nome
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Email
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Telefone
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Ativo
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
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoading && caretakers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  Nenhum caretaker cadastrado.
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
                      ? "Ativo"
                      : "Marcar ativo"}
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
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const pageSize = 20

  const { data: moradoresData, isLoading } = useQuery<
    ApiListResponse<Morador> & { count?: number }
  >({
    queryKey: ["moradores", currentPage, selectedBuilding, searchTerm],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams()
      params.append("skip", String(currentPage * pageSize))
      params.append("limit", String(pageSize))
      if (searchTerm) params.append("search", searchTerm)
      if (selectedBuilding && !searchTerm)
        params.append("building", selectedBuilding)
      return apiCall(`/api/v1/moradores/?${params.toString()}`)
    },
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const moradores = moradoresData?.data || []
  const totalCount = moradoresData?.count || 0
  const totalPages = Math.ceil(totalCount / pageSize)
  const buildings = buildingsData?.data || []

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
      queryClient.invalidateQueries({ queryKey: ["moradores"] })
      showSuccessToast("Tipos de leitura atualizados com sucesso!")
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao atualizar tipos de leitura"
      showErrorToast(message)
    },
  })

  const handleCheckboxChange = (
    id: EntityId,
    currentTypes: number,
    typeValue: number,
  ) => {
    let newTypes = currentTypes
    if (currentTypes & typeValue) {
      // Remove this type
      newTypes = currentTypes & ~typeValue
    } else {
      // Add this type
      newTypes = currentTypes | typeValue
    }
    updateReadingTypesMutation.mutate({ id, readingTypes: newTypes })
  }

  const handleBuildingChange = (building: string | null) => {
    setSelectedBuilding(building)
    setCurrentPage(0)
  }

  const handleSearch = (term: string) => {
    setSearchTerm(term)
    setCurrentPage(0)
  }

  if (isLoading && moradores.length === 0) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Carregando moradores...</p>
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
        }}
        editingId={editingId}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            Residents
          </h2>
          <button
            onClick={() => {
              setEditingId(null)
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
              <title>Adicionar morador</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Novo Morador
          </button>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              className="block text-sm font-semibold text-[#55311c] mb-2"
              htmlFor="residents-search"
            >
              Buscar por Nome, Telefone, Email ou Flat
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
              Filtrar por Building
            </label>
            <select
              id="residents-building"
              value={selectedBuilding || ""}
              onChange={(e) => handleBuildingChange(e.target.value || null)}
              className="w-full text-[#000000] rounded-lg border border-gray-300 px-3 py-2 font-['Nunito',sans-serif] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="">Todos os Buildings</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.nome}>
                  {building.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {moradores.length === 0 ? (
          <div className="rounded-lg bg-[#f5f1ee] p-8 text-center">
            <p className="text-[#55311c] font-['Nunito',sans-serif]">
              {searchTerm || selectedBuilding
                ? "Nenhum morador encontrado"
                : "Nenhum morador cadastrado"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse rounded-lg bg-white">
                <thead>
                  <tr className="bg-[#8c7569]">
                    <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                      Building
                    </th>
                    <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                      Número
                    </th>
                    <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                      Nome
                    </th>
                    <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                      Telefone
                    </th>
                    <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                      Normal
                    </th>
                    <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                      Low
                    </th>
                    <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                      Gas
                    </th>
                    <th className="border border-gray-400 px-4 py-3 text-center font-['Nunito',sans-serif] font-semibold text-white">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {moradores
                    .sort((a, b) => {
                      // Ordenar primeiro por building, depois por número do flat
                      const buildingCompare = a.building_nome.localeCompare(
                        b.building_nome,
                      )
                      if (buildingCompare !== 0) return buildingCompare
                      return a.flat_numero - b.flat_numero
                    })
                    .map((morador) => (
                      <tr key={morador.id} className="hover:bg-[#f5f1ee]">
                        <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                          {morador.building_nome}
                        </td>
                        <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                          {morador.flat_numero}
                        </td>
                        <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                          {morador.nome}
                        </td>
                        <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                          {morador.mobile || "-"}
                        </td>
                        <td className="border border-gray-400 px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={(morador.reading_types & 2) !== 0}
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
                            checked={(morador.reading_types & 1) !== 0}
                            onChange={() =>
                              handleCheckboxChange(
                                morador.id,
                                morador.reading_types,
                                1,
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
                        <td className="border border-gray-400 px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setEditingId(morador.id)
                              setShowForm(true)
                            }}
                            className="mr-2 rounded-lg bg-[#8c7569] px-3 py-1 font-['Nunito',sans-serif] text-xs font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
                            type="button"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm font-['Nunito',sans-serif] text-[#55311c]">
                Mostrando {Math.min(currentPage * pageSize + 1, totalCount)} a{" "}
                {Math.min((currentPage + 1) * pageSize, totalCount)} de{" "}
                {totalCount} moradores
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  type="button"
                  className="rounded-lg bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 hover:bg-[#55311c]"
                >
                  Anterior
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
                  Próximo
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AddResidentForm({
  onBack,
  editingId,
}: {
  onBack: () => void
  editingId: EntityId | null
}) {
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    mobile: "",
    cargo: 0,
    car1: "",
    car2: "",
    car3: "",
    flat_id: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [flats, setFlats] = useState<Array<{ id: EntityId; label: string }>>([])

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  // Load editing morador data if editingId is set
  useEffect(() => {
    if (editingId) {
      const loadMorador = async () => {
        try {
          const response = await fetch(
            `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/moradores/${editingId}`,
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
            car1: morador.car1 || "",
            car2: morador.car2 || "",
            car3: morador.car3 || "",
            flat_id: String(morador.flat_id),
          })
        } catch (error) {
          console.error("Error loading morador:", error)
        }
      }
      loadMorador()
    }
  }, [editingId])

  // Build flats list from buildings
  useEffect(() => {
    const allFlats: Array<{ id: EntityId; label: string }> = []

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
          id: flat.id,
          label: `${building.nome} - Flat ${flat.numero}`,
        })
      })
    })
    setFlats(allFlats)
  }, [buildingsData])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = editingId
        ? `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/moradores/${editingId}`
        : `${OpenAPI.BASE || "http://localhost:8000"}/api/v1/moradores/`

      const method = editingId ? "PATCH" : "POST"

      const payload = {
        nome: formData.nome,
        email: formData.email || null,
        mobile: formData.mobile || "",
        cargo: formData.cargo,
        car1: formData.car1 || null,
        car2: formData.car2 || null,
        car3: formData.car3 || null,
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
        throw new Error("Failed to save morador")
      }

      alert(
        editingId
          ? "Morador atualizado com sucesso!"
          : "Morador cadastrado com sucesso!",
      )
      onBack()
      // Refetch moradores
      window.location.reload()
    } catch (error) {
      console.error("Error submitting form:", error)
      alert("Erro ao salvar morador")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            {editingId ? "Editar Morador" : "Novo Morador"}
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
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-nome"
              >
                Nome *
              </label>
              <input
                type="text"
                id="resident-nome"
                name="nome"
                value={formData.nome}
                onChange={handleInputChange}
                required
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Nome do morador"
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
                Telefone
              </label>
              <input
                type="tel"
                id="resident-mobile"
                name="mobile"
                value={formData.mobile}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Número de telefone"
              />
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
                <option value="">Selecione um flat</option>
                {flats.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-car1"
              >
                Carro 1
              </label>
              <input
                type="text"
                id="resident-car1"
                name="car1"
                value={formData.car1}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Placa do carro"
              />
            </div>

            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-car2"
              >
                Carro 2
              </label>
              <input
                type="text"
                id="resident-car2"
                name="car2"
                value={formData.car2}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Placa do carro"
              />
            </div>

            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-car3"
              >
                Carro 3
              </label>
              <input
                type="text"
                id="resident-car3"
                name="car3"
                value={formData.car3}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Placa do carro"
              />
            </div>

            <div>
              <label
                className="block mb-2 font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]"
                htmlFor="resident-cargo"
              >
                Cargo
              </label>
              <select
                id="resident-cargo"
                name="cargo"
                value={formData.cargo}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
              >
                <option value="0">Morador</option>
                <option value="1">Proprietário</option>
                <option value="2">Inquilino</option>
              </select>
            </div>
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
              {isSubmitting
                ? "Salvando..."
                : editingId
                  ? "Atualizar Morador"
                  : "Criar Morador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
