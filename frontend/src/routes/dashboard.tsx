import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import QRCode from "qrcode"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useEffect, useMemo, useState } from "react"
import { OpenAPI } from "@/client"
import { TasksBoard } from "@/components/Tasks/TasksBoard"
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

interface BinMissCollectionRecord {
  id: EntityId
  data: string
  miss_collection: boolean
  building_id: EntityId
  building_nome: string
}

interface Morador {
  id: EntityId
  cargo: number
  building_nome: string
  flat_numero: number
  flat_id: EntityId
  nome: string
  email?: string | null
  mobile?: string | number | null
  car1?: string | null
  car2?: string | null
  car3?: string | null
  reading_types: number
}

type ResidentTypeFilter = "owner_1" | "owner_2" | "tenant" | "agent" | "all"

type FlatResidentRow = {
  key: string
  building_nome: string
  flat_numero: number
  reading_types: number
  owner_1?: Morador
  owner_2?: Morador
  tenant?: Morador
  agent?: Morador
  edit_target_id: EntityId | null
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

// Wrapper to call the API directly while the client is not regenerated
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

  // Check if the user is manager/admin (role >= 2) for this dashboard
  if (!user || ((user.cargo ?? 0) < 2 && !user.is_superuser)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f1ee]">
        <div className="rounded-lg bg-white p-8 text-center shadow-lg">
          <h1 className="mb-4 text-2xl font-bold text-[#55311c]">
            Access Denied
          </h1>
          <p className="mb-6 text-[rgba(0,0,0,0.7)]">
            This area is restricted to managers and administrators.
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
        { label: "Bins", id: "qr-bins" },
      ],
    },
  ]

  const standaloneItems = [
    { label: "Tasks", id: "tasks" },
    { label: "Residents", id: "residents" },
    { label: "Cleaner", id: "cleaner" },
    { label: "Caretaker", id: "caretaker" },
    { label: "Bins", id: "bins" },
    { label: "Twilio", id: "twillio" },
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
      case "qr-bins":
        return <BinsQrCodesContent />
      case "residents":
        return <ResidentsContent />
      case "tasks":
        return <TasksBoard mode="manager" />
      case "cleaner":
        return <CleanerContent />
      case "caretaker":
        return <CaretakerContent />
      case "bins":
        return <BinsContent />
      case "twillio":
        return <TwilioContent />
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
                  {user?.full_name || "Manager"}
                </p>
                <p className="text-xs text-[rgba(0,0,0,0.6)]">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="rounded bg-[#8c7569] px-4 py-2 font-['Nunito',sans-serif] text-sm text-white transition-all duration-300 hover:bg-[#55311c]"
                type="button"
              >
                Sign out
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
          Welcome, {user?.full_name || "Manager"}!
        </h2>
        <p className="text-[rgba(0,0,0,0.7)]">
          Manage all condo operations in one place.
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
              Residents
            </h3>
            <svg
              className="h-8 w-8 text-[#8c7569]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Residents</title>
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
          <p className="mt-1 text-sm text-[rgba(0,0,0,0.6)]">This month</p>
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
          <p className="text-[#55311c]">Loading buildings...</p>
        </div>
      </div>
    )
  }

  if (buildingsError || !buildings.length) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">No building found</p>
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
              <title>Add reading</title>
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
            Select a building:
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
    return <p className="text-center text-[#55311c]">Loading readings...</p>
  }

  if (error || !readings.length) {
    return (
      <p className="text-center text-[#55311c]">
        No readings found for this building
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
        showErrorToast("No changes detected")
        return
      }

      await Promise.all(updates)
      showSuccessToast("Readings updated successfully")
      queryClient.invalidateQueries({ queryKey: ["readings", building.id] })
      setEditingRow(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error updating readings"
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
              Actions
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
                  Edit
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
              Edit readings
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
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Save
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
      alert("Error creating readings")
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#8c7569] px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Readings"}
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
      showErrorToast("Error creating readings")
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
            No flat with configured readings found
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#8c7569] px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Readings"}
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
          <p className="text-[#55311c]">Loading buildings...</p>
        </div>
      </div>
    )
  }

  if (!buildings.length) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">No building found</p>
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
              <title>Add reading</title>
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
            Select a building:
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
              Select a flat:
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
                  No flat with configured readings in this building
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
    return <p className="text-center text-[#55311c]">Loading readings...</p>
  }

  if (error || !readings.length) {
    return (
      <p className="text-center text-[#55311c]">
        No readings found for this flat
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
        showErrorToast("No changes detected")
        return
      }

      await Promise.all(updates)
      showSuccessToast("Readings updated successfully")
      queryClient.invalidateQueries({ queryKey: ["flat_readings", flat.id] })
      setEditingRow(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error updating readings"
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
              Actions
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
                  Edit
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
              Edit readings
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
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
              >
                Save
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
          Content for {title} will be displayed here.
        </p>
      </div>
    </div>
  )
}

function normalizePhoneToE164(
  rawPhone: string | number | null | undefined,
): string | null {
  const defaultCountryCode = "+44"
  if (rawPhone === null || rawPhone === undefined) return null
  const cleaned = String(rawPhone).trim().replace(/[^\d+]/g, "")
  if (!cleaned) return null

  let normalized = cleaned
  if (!normalized.startsWith("+")) {
    const digitsOnly = normalized.replace(/\D/g, "")
    const country = defaultCountryCode.replace(/[^\d+]/g, "")
    normalized = `${country}${digitsOnly}`
  }

  const e164Regex = /^\+[1-9]\d{8,19}$/
  return e164Regex.test(normalized) ? normalized : null
}

function getResidentRoleLabel(cargo: number): string {
  switch (cargo) {
    case 0:
      return "Owner 1"
    case 1:
      return "Owner 2"
    case 2:
      return "Tenant"
    case 3:
      return "Agent"
    default:
      return "Unknown"
  }
}

function TwilioContent() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([])
  const [selectedResidentIds, setSelectedResidentIds] = useState<string[]>([])
  const [messageBody, setMessageBody] = useState("")
  const [residentSearch, setResidentSearch] = useState("")
  const [residentBuildingFilter, setResidentBuildingFilter] = useState("all")
  const [residentRoleFilter, setResidentRoleFilter] = useState("all")
  const [isSending, setIsSending] = useState(false)
  const [sendReport, setSendReport] = useState<{
    success: number
    failed: number
    skipped: number
    errors: string[]
  } | null>(null)

  const { data: buildingsData, isLoading: buildingsLoading } = useQuery<
    ApiListResponse<Building>
  >({
    queryKey: ["buildings", "twilio-sms"],
    queryFn: () => apiCall("/api/v1/buildings/condominio", { skip: 0, limit: 100 }),
  })

  const { data: ResidentsData, isLoading: ResidentsLoading } = useQuery<Morador[]>({
    queryKey: ["Residents", "twilio-sms"],
    queryFn: async () => {
      const allResidents: Morador[] = []
      let skip = 0
      const limit = 100

      while (true) {
        const page = (await apiCall("/api/v1/moradores/", {
          skip,
          limit,
        })) as ApiListResponse<Morador>
        const batch = page.data || []
        allResidents.push(...batch)
        const total = page.count ?? allResidents.length

        if (allResidents.length >= total || batch.length === 0) break
        skip += limit
      }

      return allResidents
    },
  })

  const buildings = buildingsData?.data || []
  const Residents = ResidentsData || []

  const buildingNameById = useMemo(() => {
    const map = new Map<string, string>()
    buildings.forEach((building) => {
      map.set(String(building.id), building.nome)
    })
    return map
  }, [buildings])

  const filteredResidents = useMemo(() => {
    const search = residentSearch.trim().toLowerCase()
    return Residents.filter((morador) => {
      if (
        residentBuildingFilter !== "all" &&
        morador.building_nome !== residentBuildingFilter
      ) {
        return false
      }
      if (
        residentRoleFilter !== "all" &&
        String(morador.cargo) !== residentRoleFilter
      ) {
        return false
      }
      if (!search) return true

      const fields = [
        morador.nome,
        morador.building_nome,
        String(morador.flat_numero),
        morador.mobile ? String(morador.mobile) : "",
      ]
      return fields.some((value) => value.toLowerCase().includes(search))
    })
  }, [Residents, residentSearch, residentBuildingFilter, residentRoleFilter])

  const recipients = useMemo(() => {
    const residentIdSet = new Set(selectedResidentIds)
    const selectedBuildingNames = new Set(
      selectedBuildingIds
        .map((id) => buildingNameById.get(id))
        .filter((name): name is string => Boolean(name)),
    )

    const selectedMap = new Map<string, Morador>()

    Residents.forEach((morador) => {
      const id = String(morador.id)
      const includedByResident = residentIdSet.has(id)
      const includedByBuilding = selectedBuildingNames.has(morador.building_nome)

      if (includedByResident || includedByBuilding) {
        selectedMap.set(id, morador)
      }
    })

    return Array.from(selectedMap.values()).sort((a, b) => {
      if (a.building_nome !== b.building_nome) {
        return a.building_nome.localeCompare(b.building_nome)
      }
      if (a.flat_numero !== b.flat_numero) {
        return a.flat_numero - b.flat_numero
      }
      return a.nome.localeCompare(b.nome)
    })
  }, [Residents, selectedResidentIds, selectedBuildingIds, buildingNameById])

  const toggleBuilding = (buildingId: string) => {
    setSelectedBuildingIds((prev) =>
      prev.includes(buildingId)
        ? prev.filter((id) => id !== buildingId)
        : [...prev, buildingId],
    )
  }

  const toggleResident = (residentId: string) => {
    setSelectedResidentIds((prev) =>
      prev.includes(residentId)
        ? prev.filter((id) => id !== residentId)
        : [...prev, residentId],
    )
  }

  const selectAllFilteredResidents = () => {
    const ids = filteredResidents.map((morador) => String(morador.id))
    setSelectedResidentIds((prev) => Array.from(new Set([...prev, ...ids])))
  }

  const clearSelections = () => {
    setSelectedBuildingIds([])
    setSelectedResidentIds([])
    setSendReport(null)
  }

  const sendBulkSms = async () => {
    const body = messageBody.trim()
    if (!body) {
      showErrorToast("Escreva a Message antes de enviar.")
      return
    }

    if (recipients.length === 0) {
      showErrorToast("Select at least one resident or one building.")
      return
    }

    setIsSending(true)
    setSendReport(null)

    const errors: string[] = []
    let success = 0
    let failed = 0
    let skipped = 0

    const base = OpenAPI.BASE || "http://localhost:8000"

    for (const recipient of recipients) {
      const phoneTo = normalizePhoneToE164(recipient.mobile)
      if (!phoneTo) {
        skipped += 1
        errors.push(
          `${recipient.nome} (${recipient.building_nome} ${recipient.flat_numero}): invalid phone number`,
        )
        continue
      }

      try {
        const response = await fetch(`${base}/api/v1/utils/send-sms/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
          body: JSON.stringify({
            phone_to: phoneTo,
            body,
          }),
        })

        if (!response.ok) {
          let detail = `Erro HTTP ${response.status}`
          try {
            const errorPayload = (await response.json()) as {
              detail?: string
              message?: string
            }
            detail = errorPayload.detail || errorPayload.message || detail
          } catch (_error) {
            // ignore parse errors and keep default detail
          }
          throw new Error(detail)
        }

        success += 1
      } catch (error) {
        failed += 1
        errors.push(
          `${recipient.nome} (${recipient.building_nome} ${recipient.flat_numero}): ${
            error instanceof Error ? error.message : "erro ao enviar"
          }`,
        )
      }
    }

    setIsSending(false)
    setSendReport({ success, failed, skipped, errors })

    if (success > 0) {
      showSuccessToast(`${success} SMS enviado(s) com sucesso.`)
    }
    if (failed > 0 || skipped > 0) {
      showErrorToast(
        `Completed with failures: ${failed} failure(s), ${skipped} skipped.`,
      )
    }
  }

  if (buildingsLoading || ResidentsLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md">
          <p className="font-['Nunito',sans-serif] text-[#55311c]">
            Loading Twilio data...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          Twilio SMS
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
              Buildings
            </h3>
            <button
              type="button"
              onClick={() => setSelectedBuildingIds([])}
              className="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-gray-300"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {buildings.map((building) => {
              const id = String(building.id)
              const checked = selectedBuildingIds.includes(id)
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-3 rounded border border-[#e8ddd6] px-3 py-2 hover:bg-[#f9f7f5]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBuilding(id)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <span className="font-['Nunito',sans-serif] text-[#55311c]">
                    {building.nome}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
              Residents
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllFilteredResidents}
                className="rounded bg-[#8c7569] px-3 py-1 text-xs font-semibold text-white hover:bg-[#55311c]"
              >
                Select filtered
              </button>
              <button
                type="button"
                onClick={() => setSelectedResidentIds([])}
                className="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-[#55311c] hover:bg-gray-300"
              >
                Clear
              </button>
            </div>
          </div>

          <input
            value={residentSearch}
            onChange={(e) => setResidentSearch(e.target.value)}
            placeholder="Buscar por nome, building, flat ou Phone"
            className="mb-3 w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
          />

          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <select
              value={residentBuildingFilter}
              onChange={(e) => setResidentBuildingFilter(e.target.value)}
              className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="all">All buildings</option>
              {buildings
                .map((building) => building.nome)
                .sort((a, b) => a.localeCompare(b))
                .map((buildingName) => (
                  <option key={buildingName} value={buildingName}>
                    {buildingName}
                  </option>
                ))}
            </select>

            <select
              value={residentRoleFilter}
              onChange={(e) => setResidentRoleFilter(e.target.value)}
              className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="all">All roles</option>
              <option value="0">Owner 1</option>
              <option value="1">Owner 2</option>
              <option value="2">Tenant</option>
              <option value="3">Agent</option>
            </select>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-2">
            {filteredResidents.map((morador) => {
              const id = String(morador.id)
              const checked = selectedResidentIds.includes(id)
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-3 rounded border border-[#e8ddd6] px-3 py-2 hover:bg-[#f9f7f5]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleResident(id)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-['Nunito',sans-serif] text-sm font-semibold text-[#55311c]">
                      {morador.nome}
                    </p>
                    <p className="truncate text-xs text-[rgba(0,0,0,0.65)]">
                      {getResidentRoleLabel(morador.cargo)} |{" "}
                      {morador.building_nome} {morador.flat_numero} |{" "}
                      {morador.mobile || "no phone"}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded border border-[#e8ddd6] bg-[#f9f7f5] p-3">
            <p className="text-xs uppercase tracking-wide text-[#8c7569]">
              Buildings selecionados
            </p>
            <p className="text-2xl font-bold text-[#55311c]">
              {selectedBuildingIds.length}
            </p>
          </div>
          <div className="rounded border border-[#e8ddd6] bg-[#f9f7f5] p-3">
            <p className="text-xs uppercase tracking-wide text-[#8c7569]">
              Residents selecionados
            </p>
            <p className="text-2xl font-bold text-[#55311c]">
              {selectedResidentIds.length}
            </p>
          </div>
          <div className="rounded border border-[#e8ddd6] bg-[#f9f7f5] p-3">
            <p className="text-xs uppercase tracking-wide text-[#8c7569]">
              Final recipients
            </p>
            <p className="text-2xl font-bold text-[#55311c]">{recipients.length}</p>
          </div>
        </div>

        <label
          className="mb-1 block text-sm font-semibold text-[#55311c]"
          htmlFor="twilio-message-body"
        >
          Message
        </label>
        <textarea
          id="twilio-message-body"
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          rows={5}
          maxLength={1600}
          placeholder="Digite sua Message..."
          className="w-full rounded border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
        />
        <p className="mt-1 text-xs text-[rgba(0,0,0,0.6)]">
          {messageBody.length}/1600 caracteres
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={sendBulkSms}
            disabled={isSending}
            className="rounded bg-[#8c7569] px-5 py-2 font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? "Enviando..." : "Enviar SMS em lote"}
          </button>
          <button
            type="button"
            onClick={clearSelections}
            disabled={isSending}
            className="rounded bg-gray-200 px-5 py-2 font-semibold text-[#55311c] hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear selection
          </button>
        </div>

        {sendReport && (
          <div className="mt-6 rounded border border-[#e8ddd6] bg-[#f9f7f5] p-4">
            <h4 className="font-['Nunito',sans-serif] text-lg font-bold text-[#55311c]">
              Resultado do envio
            </h4>
            <p className="mt-1 text-sm text-[rgba(0,0,0,0.7)]">
              {sendReport.success} sucesso(s), {sendReport.failed} falha(s),{" "}
              {sendReport.skipped} ignorado(s).
            </p>

            {sendReport.errors.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded bg-white p-3">
                <ul className="space-y-1 text-xs text-[#55311c]">
                  {sendReport.errors.map((error, index) => (
                    <li key={`${error}-${index}`}>- {error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function BinsQrCodesContent() {
  const { data: buildingsData, isLoading } = useQuery({
    queryKey: ["buildings", "qr-bins"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const buildings = useMemo(
    () =>
      ((buildingsData?.data || []) as Building[]).filter(
        (building) => building.nome.trim().toLowerCase() !== "office",
      ),
    [buildingsData?.data],
  )

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
        setIsGenerating(false)
        return
      }

      setIsGenerating(true)
      const nextMap: Record<string, { dataUrl: string; link: string }> = {}

      for (let index = 0; index < buildings.length; index += 1) {
        const building = buildings[index]
        const params = new URLSearchParams()
        params.set("buildingId", String(building.id))
        if (building.nome) {
          params.set("buildingName", String(building.nome))
        }
        const link = `${baseUrl}/bins-access?${params.toString()}`
        const dataUrl = await QRCode.toDataURL(link, {
          width: 240,
          margin: 1,
        })

        if (!isActive) return
        nextMap[String(building.id)] = { dataUrl, link }

        // Prevent long main-thread blocking when many buildings exist.
        if (index % 4 === 3) {
          setQrMap({ ...nextMap })
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }

      if (!isActive) return
      setQrMap(nextMap)
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
          QR Code - Bins
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          Use this QR only when the waste was not collected.
        </p>
      </div>

      {(isLoading || isGenerating) && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[#55311c] shadow-md">
          Generating QR codes...
        </div>
      )}

      {!isLoading && buildings.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center text-sm text-[rgba(0,0,0,0.7)] shadow-md">
          No buildings found.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {buildings.map((building) => {
          const qr = qrMap[String(building.id)]
          return (
            <div
              key={String(building.id)}
              className="rounded-lg bg-white p-5 shadow-md transition-all duration-200 hover:shadow-lg"
            >
              <div className="mb-4">
                <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
                  {building.nome}
                </h3>
              </div>

              <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-3">
                {qr ? (
                  <img
                    src={qr.dataUrl}
                    alt={`QR Code - Bins - ${building.nome}`}
                    className="h-56 w-56"
                  />
                ) : (
                  <p className="text-sm text-[rgba(0,0,0,0.6)]">Generating...</p>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {qr && (
                  <>
                    <a
                      href={qr.dataUrl}
                      download={`bins-${building.nome.toLowerCase().replace(/\s+/g, "-")}.png`}
                      className="block rounded-lg bg-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-300 hover:bg-[#55311c]"
                    >
                      Download PNG
                    </a>
                    <a
                      href={qr.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
                    >
                      Open link
                    </a>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BinsContent() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [page, setPage] = useState(0)
  const [buildingFilter, setBuildingFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const pageSize = 20

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings", "bins-filter"],
    queryFn: () => apiCall("/api/v1/buildings/condominio", { skip: 0, limit: 500 }),
  })

  const filterParams = useMemo(
    () => ({
      building_id: buildingFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [buildingFilter, dateFrom, dateTo],
  )

  const { data, isLoading, error } = useQuery<
    ApiListResponse<BinMissCollectionRecord>
  >({
    queryKey: ["bins", page, pageSize, filterParams],
    queryFn: () =>
      apiCall("/api/v1/bins/", {
        skip: page * pageSize,
        limit: pageSize,
        ...filterParams,
      }),
    placeholderData: keepPreviousData,
  })

  const buildings = (buildingsData?.data || []) as Building[]
  const items = data?.data || []
  const count = data?.count || 0
  const totalPages = Math.max(1, Math.ceil(count / pageSize))

  const formatDate = (value: string) => {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return "-"
    return dt.toLocaleDateString()
  }

  const formatTime = (value: string) => {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return "-"
    return dt.toLocaleTimeString()
  }

  const formatCsvValue = (value: string | number | boolean) => {
    const text = String(value).replace(/"/g, '""')
    return `"${text}"`
  }

  const handleDownloadReport = async () => {
    setIsDownloadingReport(true)
    try {
      const firstPage = (await apiCall("/api/v1/bins/", {
        skip: 0,
        limit: 1,
        ...filterParams,
      })) as ApiListResponse<BinMissCollectionRecord>

      const total = firstPage.count || 0
      if (!total) {
        showErrorToast("Nenhum resultado para gerar relatório.")
        return
      }

      const fullResult = (await apiCall("/api/v1/bins/", {
        skip: 0,
        limit: total,
        ...filterParams,
      })) as ApiListResponse<BinMissCollectionRecord>

      const lines = [
        ["Date", "Time", "Building", "Miss Collection"].join(","),
        ...fullResult.data.map((item) =>
          [
            formatCsvValue(formatDate(item.data)),
            formatCsvValue(formatTime(item.data)),
            formatCsvValue(item.building_nome),
            formatCsvValue(item.miss_collection ? "Yes" : "No"),
          ].join(","),
        ),
      ]
      const csv = `\uFEFF${lines.join("\n")}`
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      const day = new Date().toISOString().slice(0, 10)
      link.href = href
      link.download = `bins-report-${day}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(href)
      showSuccessToast("Relatório gerado com sucesso.")
    } catch {
      showErrorToast("Erro ao gerar relatório.")
    } finally {
      setIsDownloadingReport(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Loading bins records...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-red-700">Error loading bins records.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
          Bins
        </h2>
        <p className="mt-2 text-[rgba(0,0,0,0.7)]">
          Log de eventos de miss collection por building.
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <div>
            <label
              htmlFor="bins-building-filter"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              Build
            </label>
            <select
              id="bins-building-filter"
              value={buildingFilter}
              onChange={(e) => {
                setBuildingFilter(e.target.value)
                setPage(0)
              }}
              className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
            >
              <option value="">Todos</option>
              {buildings.map((building) => (
                <option key={String(building.id)} value={String(building.id)}>
                  {building.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="bins-date-from"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              Data inicial
            </label>
            <input
              id="bins-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(0)
              }}
              className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="bins-date-to"
              className="mb-1 block text-sm font-semibold text-[#55311c]"
            >
              Data final
            </label>
            <input
              id="bins-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(0)
              }}
              className="w-full rounded border border-[#d9d0ca] px-3 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={isDownloadingReport}
              className="w-full rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#55311c]"
            >
              {isDownloadingReport ? "Gerando..." : "Baixar relatório"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#8c7569]">
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Data
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Time
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Building
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-white">
                  Miss Collection
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.id)} className="hover:bg-[#f5f1ee]">
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {formatDate(item.data)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {formatTime(item.data)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {item.building_nome}
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-[#55311c]">
                    {item.miss_collection ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="border border-gray-300 px-4 py-8 text-center text-[rgba(0,0,0,0.65)]"
                  >
                    No miss collection records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-[#55311c]">
            Mostrando {items.length} de {count} registro(s)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#55311c]"
            >
              Anterior
            </button>
            <span className="flex items-center px-3 text-sm text-[#55311c]">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#55311c]"
            >
              Next
            </button>
          </div>
        </div>
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
          No building found.
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
                QR Code unavailable
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
                <a
                  href={qrItem.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
                >
                  Open link
                </a>
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
          No building found.
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
                  Code: {building.id}
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
                    QR Code unavailable
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
                    <a
                      href={qrItem.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-[#8c7569] px-4 py-2 text-center text-sm font-semibold text-[#55311c] transition-all duration-300 hover:bg-[#f3eeea]"
                    >
                      Open link
                    </a>
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
              Work summary and cleaner registration.
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
              Work summary and caretaker registration.
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

    return result.reverse()
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

  const getDurationMinutes = (
    inValue?: string | null,
    outValue?: string | null,
  ) => {
    if (!inValue || !outValue) return 0
    const start = new Date(inValue).getTime()
    const end = new Date(outValue).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
    const diffMinutes = Math.floor((end - start) / 60000)
    if (diffMinutes >= 1440) return 0
    return diffMinutes
  }

  const formatTotalMinutes = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  const enrichedSessions = useMemo(() => {
    return sessions.map((session) => {
      const buildingId =
        session.inRecord?.building_id || session.outRecord?.building_id
      const buildingLabel =
        (buildingId && buildingMap.get(buildingId)) ||
        session.inRecord?.building_nome ||
        session.outRecord?.building_nome ||
        "-"
      const durationMinutes = getDurationMinutes(
        session.inRecord?.data,
        session.outRecord?.data,
      )
      const startDate = session.inRecord?.data
        ? new Date(session.inRecord.data)
        : null

      return {
        ...session,
        buildingLabel,
        durationMinutes,
        startDate,
      }
    })
  }, [sessions, buildingMap])

  const tableSessions = useMemo(
    () => enrichedSessions.slice(0, 20),
    [enrichedSessions],
  )

  const buildingHoursData = useMemo(() => {
    const hoursByBuilding = new Map<string, number>()

    enrichedSessions.forEach((session) => {
      if (!session.durationMinutes || !session.buildingLabel) return
      const current = hoursByBuilding.get(session.buildingLabel) || 0
      hoursByBuilding.set(
        session.buildingLabel,
        current + session.durationMinutes,
      )
    })

    return [...hoursByBuilding.entries()]
      .map(([building, minutes]) => ({
        building,
        hours: Number((minutes / 60).toFixed(2)),
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [enrichedSessions])

  const workloadCards = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    const dayOfWeek = weekStart.getDay()
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    weekStart.setDate(weekStart.getDate() - diffToMonday)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let todayMinutes = 0
    let weekMinutes = 0
    let monthMinutes = 0

    enrichedSessions.forEach((session) => {
      if (!session.startDate || !session.durationMinutes) return
      const startTime = session.startDate.getTime()
      if (startTime >= todayStart.getTime())
        todayMinutes += session.durationMinutes
      if (startTime >= weekStart.getTime()) weekMinutes += session.durationMinutes
      if (startTime >= monthStart.getTime())
        monthMinutes += session.durationMinutes
    })

    return [
      { label: "Hoje", value: formatTotalMinutes(todayMinutes) },
      { label: "Semana", value: formatTotalMinutes(weekMinutes) },
      { label: "Mês", value: formatTotalMinutes(monthMinutes) },
    ]
  }, [enrichedSessions])

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-['Nunito',sans-serif] text-xl font-bold text-[#55311c]">
          Work summary
        </h3>
        {!activeCleanerId && (
          <span className="rounded-full bg-[#f5f1ee] px-3 py-1 text-xs font-semibold text-[#55311c]">
            Select an active cleaner from registration
          </span>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {workloadCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgba(85,49,28,0.75)]">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-bold text-[#55311c]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-lg border border-[#e5e0dc] bg-[#faf8f6] p-4">
        <h4 className="mb-3 text-sm font-semibold text-[#55311c]">
          Horas por building
        </h4>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buildingHoursData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d0ca" />
              <XAxis
                dataKey="building"
                stroke="#55311c"
                tick={{ fill: "#55311c", fontSize: 12 }}
              />
              <YAxis stroke="#55311c" tick={{ fill: "#55311c", fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => [`${value}h`, "Horas"]}
                contentStyle={{
                  borderRadius: "10px",
                  border: "1px solid #e5e0dc",
                  backgroundColor: "#fff",
                }}
              />
              <Bar
                dataKey="hours"
                fill="#8c7569"
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!isLoadingAcess && buildingHoursData.length === 0 && (
          <p className="mt-3 text-sm text-[rgba(0,0,0,0.6)]">
            Sem sessoes fechadas para gerar grafico.
          </p>
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
                  Loading...
                </td>
              </tr>
            )}
            {!isLoadingAcess && tableSessions.length === 0 && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={5}
                >
                  No records found.
                </td>
              </tr>
            )}
            {tableSessions.map((session, index) => {
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
                    {session.buildingLabel}
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
      showErrorToast("Could not register cleaner")
    },
  })

  const setDefaultCleanerMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/funcionarios/${id}`, {
        method: "PATCH",
        body: { is_default: true },
      }),
    onSuccess: () => {
      showSuccessToast("Default cleaner updated")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "cleaners"] })
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "cleaners-summary"],
      })
    },
    onError: () => {
      showErrorToast("Could not update default cleaner")
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
      showErrorToast("User is not associated with a condominium")
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
                Phone
              </label>
              <input
                type="tel"
                id="cleaner-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Phone"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCleaner}
              className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Save
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
                Phone
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Active
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
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && cleaners.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  No cleaner registered.
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
                    {activeCleanerId === cleaner.id ? "Active" : "Set active"}
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
          Work summary
        </h3>
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
                  Loading...
                </td>
              </tr>
            )}
            {!isLoadingAcess && sessions.length === 0 && (
              <tr>
                <td
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                  colSpan={5}
                >
                  No records found.
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
      showErrorToast("Could not register caretaker")
    },
  })

  const setDefaultCaretakerMutation = useMutation({
    mutationFn: (id: EntityId) =>
      apiCall(`/api/v1/funcionarios/${id}`, {
        method: "PATCH",
        body: { is_default: true },
      }),
    onSuccess: () => {
      showSuccessToast("Default caretaker updated")
      queryClient.invalidateQueries({ queryKey: ["funcionarios", "caretakers"] })
      queryClient.invalidateQueries({
        queryKey: ["funcionarios", "caretakers-summary"],
      })
    },
    onError: () => {
      showErrorToast("Could not update default caretaker")
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
      showErrorToast("User is not associated with a condominium")
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
                Phone
              </label>
              <input
                type="tel"
                id="caretaker-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-lg border border-[#ddd] px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
                placeholder="Phone"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#8c7569] px-4 py-2 text-sm font-semibold text-[#55311c] transition-all duration-200 hover:bg-[#f0ebe7]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCaretaker}
              className="rounded-lg bg-[#8c7569] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              Save
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
                Phone
              </th>
              <th className="border border-gray-400 px-3 py-2 text-left text-sm font-bold text-gray-700">
                Active
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
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && caretakers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-gray-400 px-3 py-3 text-center text-sm text-gray-600"
                >
                  No caretaker registered.
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
                      ? "Active"
                      : "Set active"}
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
  const [residentTypeFilter, setResidentTypeFilter] =
    useState<ResidentTypeFilter>("owner_1")
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const pageSize = 20

  const { data: ResidentsData, isLoading } = useQuery<
    ApiListResponse<Morador> & { count?: number }
  >({
    queryKey: ["Residents", selectedBuilding, searchTerm],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const pageLimit = 100
      const allResidents: Morador[] = []
      let skip = 0
      let totalCount: number | undefined

      while (true) {
        const params = new URLSearchParams()
        params.append("skip", String(skip))
        params.append("limit", String(pageLimit))
        if (searchTerm) params.append("search", searchTerm)
        if (selectedBuilding && !searchTerm)
          params.append("building", selectedBuilding)

        const page = (await apiCall(
          `/api/v1/moradores/?${params.toString()}`,
        )) as ApiListResponse<Morador> & { count?: number }

        const pageData = page.data || []
        totalCount = page.count
        allResidents.push(...pageData)

        if (pageData.length < pageLimit) break
        if (typeof totalCount === "number" && allResidents.length >= totalCount)
          break

        skip += pageLimit
      }

      return {
        data: allResidents,
        count: totalCount ?? allResidents.length,
      }
    },
  })

  const { data: buildingsData } = useQuery<ApiListResponse<Building>>({
    queryKey: ["buildings"],
    queryFn: () => apiCall("/api/v1/buildings/condominio"),
  })

  const Residents = ResidentsData?.data || []
  const buildings = buildingsData?.data || []

  const sortedResidents = useMemo(
    () =>
      [...Residents].sort((a, b) => {
        const buildingCompare = a.building_nome.localeCompare(b.building_nome)
        if (buildingCompare !== 0) return buildingCompare
        if (a.flat_numero !== b.flat_numero) return a.flat_numero - b.flat_numero
        return a.nome.localeCompare(b.nome)
      }),
    [Residents],
  )

  const RoleFilterMap: Record<Exclude<ResidentTypeFilter, "all">, number> = {
    owner_1: 0,
    owner_2: 1,
    tenant: 2,
    agent: 3,
  }

  const filteredResidents = useMemo(() => {
    if (residentTypeFilter === "all") return sortedResidents
    return sortedResidents.filter(
      (morador) => morador.cargo === RoleFilterMap[residentTypeFilter],
    )
  }, [sortedResidents, residentTypeFilter])

  const groupedFlatRows = useMemo<FlatResidentRow[]>(() => {
    if (residentTypeFilter !== "all") return []

    const groups = new Map<string, FlatResidentRow>()

    filteredResidents.forEach((morador) => {
      const key = `${morador.building_nome}::${morador.flat_numero}::${morador.flat_id}`
      const current = groups.get(key) ?? {
        key,
        building_nome: morador.building_nome,
        flat_numero: morador.flat_numero,
        reading_types: morador.reading_types,
        edit_target_id: null,
      }

      if (morador.cargo === 0 && !current.owner_1) current.owner_1 = morador
      if (morador.cargo === 1 && !current.owner_2) current.owner_2 = morador
      if (morador.cargo === 2 && !current.tenant) current.tenant = morador
      if (morador.cargo === 3 && !current.agent) current.agent = morador
      current.reading_types = morador.reading_types
      current.edit_target_id =
        current.owner_1?.id ??
        current.owner_2?.id ??
        current.tenant?.id ??
        current.agent?.id ??
        null

      groups.set(key, current)
    })

    return [...groups.values()].sort((a, b) => {
      const buildingCompare = a.building_nome.localeCompare(b.building_nome)
      if (buildingCompare !== 0) return buildingCompare
      return a.flat_numero - b.flat_numero
    })
  }, [filteredResidents, residentTypeFilter])

  const isAllTypeView = residentTypeFilter === "all"
  const totalCount = isAllTypeView
    ? groupedFlatRows.length
    : filteredResidents.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    setCurrentPage(0)
  }, [selectedBuilding, searchTerm, residentTypeFilter])

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1))
    }
  }, [currentPage, totalPages])

  const paginatedResidents = useMemo(() => {
    if (isAllTypeView) return []
    const start = currentPage * pageSize
    return filteredResidents.slice(start, start + pageSize)
  }, [filteredResidents, currentPage, pageSize, isAllTypeView])

  const paginatedFlatRows = useMemo(() => {
    if (!isAllTypeView) return []
    const start = currentPage * pageSize
    return groupedFlatRows.slice(start, start + pageSize)
  }, [groupedFlatRows, currentPage, pageSize, isAllTypeView])

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
      queryClient.invalidateQueries({ queryKey: ["Residents"] })
      showSuccessToast("Reading types updated successfully!")
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Error updating reading types"
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

  const handleResidentTypeFilterChange = (value: ResidentTypeFilter) => {
    setResidentTypeFilter(value)
    setCurrentPage(0)
  }

  if (isLoading && Residents.length === 0) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <p className="text-[#55311c]">Loading residents...</p>
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
              <title>Add resident</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Resident
          </button>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              className="block text-sm font-semibold text-[#55311c] mb-2"
              htmlFor="residents-search"
            >
              Buscar por Nome, Phone, Email ou Flat
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
              className="block text-sm font-semibold text-[#55311c] mb-2"
              htmlFor="residents-type"
            >
              Filtrar por Tipo
            </label>
            <select
              id="residents-type"
              value={residentTypeFilter}
              onChange={(e) =>
                handleResidentTypeFilterChange(
                  e.target.value as ResidentTypeFilter,
                )
              }
              className="w-full text-[#000000] rounded-lg border border-gray-300 px-3 py-2 font-['Nunito',sans-serif] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7569]"
            >
              <option value="owner_1">Owner 1</option>
              <option value="owner_2">Owner 2</option>
              <option value="tenant">Tenant</option>
              <option value="agent">Agent</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>

        {totalCount === 0 ? (
          <div className="rounded-lg bg-[#f5f1ee] p-8 text-center">
            <p className="text-[#55311c] font-['Nunito',sans-serif]">
              {searchTerm || selectedBuilding
                ? "No resident found"
                : "No resident registered"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse rounded-lg bg-white">
                {isAllTypeView ? (
                  <>
                    <thead>
                      <tr className="bg-[#8c7569]">
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Building
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Number
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Owner 1
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone 1
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Owner 2
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone 2
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Tenant
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Agent
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone
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
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedFlatRows.map((row) => (
                        <tr key={row.key} className="hover:bg-[#f5f1ee]">
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.building_nome}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.flat_numero}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.owner_1?.nome || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.owner_1?.mobile || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.owner_2?.nome || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.owner_2?.mobile || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.tenant?.nome || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.tenant?.mobile || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.agent?.nome || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 font-['Nunito',sans-serif] text-[#55311c]">
                            {row.agent?.mobile || "-"}
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={(row.reading_types & 2) !== 0}
                              onChange={() =>
                                row.edit_target_id !== null &&
                                handleCheckboxChange(
                                  row.edit_target_id,
                                  row.reading_types,
                                  2,
                                )
                              }
                              disabled={
                                updateReadingTypesMutation.isPending ||
                                row.edit_target_id === null
                              }
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={(row.reading_types & 1) !== 0}
                              onChange={() =>
                                row.edit_target_id !== null &&
                                handleCheckboxChange(
                                  row.edit_target_id,
                                  row.reading_types,
                                  1,
                                )
                              }
                              disabled={
                                updateReadingTypesMutation.isPending ||
                                row.edit_target_id === null
                              }
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={(row.reading_types & 4) !== 0}
                              onChange={() =>
                                row.edit_target_id !== null &&
                                handleCheckboxChange(
                                  row.edit_target_id,
                                  row.reading_types,
                                  4,
                                )
                              }
                              disabled={
                                updateReadingTypesMutation.isPending ||
                                row.edit_target_id === null
                              }
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-400 px-4 py-3 text-center">
                            <button
                              onClick={() => {
                                if (row.edit_target_id === null) return
                                setEditingId(row.edit_target_id)
                                setShowForm(true)
                              }}
                              className="mr-2 rounded-lg bg-[#8c7569] px-3 py-1 font-['Nunito',sans-serif] text-xs font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
                              type="button"
                              disabled={row.edit_target_id === null}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr className="bg-[#8c7569]">
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Building
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Number
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Nome
                        </th>
                        <th className="border border-gray-400 px-4 py-3 text-left font-['Nunito',sans-serif] font-semibold text-white">
                          Phone
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
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedResidents.map((morador) => (
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
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm font-['Nunito',sans-serif] text-[#55311c]">
                Mostrando {Math.min(currentPage * pageSize + 1, totalCount)} a{" "}
                {Math.min((currentPage + 1) * pageSize, totalCount)} de{" "}
                {totalCount} Residents
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
                  Next
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
          console.error("Error loading resident:", error)
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
        throw new Error("Failed to save resident")
      }

      alert(
        editingId
          ? "Resident updated successfully!"
          : "Resident created successfully!",
      )
      onBack()
      // Refetch Residents
      window.location.reload()
    } catch (error) {
      console.error("Error submitting form:", error)
      alert("Error saving resident")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Nunito',sans-serif] text-3xl font-bold text-[#55311c]">
            {editingId ? "Edit Resident" : "New Resident"}
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
                placeholder="Resident name"
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
                Phone
              </label>
              <input
                type="tel"
                id="resident-mobile"
                name="mobile"
                value={formData.mobile}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
                placeholder="Phone number"
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
                <option value="">Select a flat</option>
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
                cargo
              </label>
              <select
                id="resident-cargo"
                name="cargo"
                value={formData.cargo}
                onChange={handleInputChange}
                className="w-full rounded-lg border-2 border-[#ddd] bg-white px-4 py-2 font-['Nunito',sans-serif] text-[#55311c] transition-all duration-200 focus:border-[#8c7569] focus:outline-none"
              >
                <option value="0">Resident</option>
                <option value="1">Owner</option>
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#8c7569] px-6 py-3 font-['Nunito',sans-serif] text-white transition-all duration-300 hover:bg-[#55311c] disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving..."
                : editingId
                  ? "Update Resident"
                  : "Create Resident"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


