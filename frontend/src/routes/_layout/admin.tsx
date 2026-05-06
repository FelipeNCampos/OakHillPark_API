import { useMutation, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

import { type UserPublic, UsersService } from "@/client"
import {
  AcessService,
  BuildingsService,
  CaretakerInvoicesService,
  CashFlowService,
  CleanerInvoicesService,
  CondominiosService,
  FireAlarmExternalCertificatesService,
  FlatsService,
  FuncionariosService,
  MoradoresService,
  ReadingsService,
  RemindersService,
} from "@/client/admin"
import AddUser from "@/components/Admin/AddUser"
import { ContractorHistoryContent } from "@/components/Admin/ContractorHistoryContent"
import CrudSection from "@/components/Admin/CrudSection"
import { columns, type UserTableData } from "@/components/Admin/columns"
import { DataTable } from "@/components/Common/DataTable"
import PendingUsers from "@/components/Pending/PendingUsers"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

function getUsersQueryOptions() {
  return {
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 100 }),
    queryKey: ["users"],
  }
}

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  beforeLoad: async () => {
    const user = await UsersService.readUserMe()
    if (!user.is_superuser) {
      throw redirect({
        to: "/",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Admin - FastAPI Cloud",
      },
    ],
  }),
})

function UsersTableContent() {
  const { user: currentUser } = useAuth()
  const { data: users } = useSuspenseQuery(getUsersQueryOptions())

  const tableData: UserTableData[] = users.data.map((user: UserPublic) => ({
    ...user,
    isCurrentUser: currentUser?.id === user.id,
  }))

  return <DataTable columns={columns} data={tableData} />
}

function UsersTable() {
  return (
    <Suspense fallback={<PendingUsers />}>
      <UsersTableContent />
    </Suspense>
  )
}

function Admin() {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const today = new Date().toISOString().slice(0, 10)
  const sampleMediaData = "data:text/plain;base64,SGVsbG8="
  const executeRemindersMutation = useMutation({
    mutationFn: () => RemindersService.executeDueReminders(),
    onSuccess: (result) => {
      showSuccessToast(
        `Checked ${result.checked}, triggered ${result.triggered}, sent ${result.sms_sent} SMS and created ${result.tasks_created} task(s)`,
      )
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to execute reminders"
      showErrorToast(message)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">
          Manage users, operational tables, finance, reminders, and supporting records.
        </p>
      </div>
      <Tabs defaultValue="users">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="condominios">Condominiums</TabsTrigger>
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="flats">Flats</TabsTrigger>
          <TabsTrigger value="moradores">Residents</TabsTrigger>
          <TabsTrigger value="funcionarios">Staff</TabsTrigger>
          <TabsTrigger value="acess">Access</TabsTrigger>
          <TabsTrigger value="readings">Readings</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash flow</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="cleaner-invoices">Cleaner invoices</TabsTrigger>
          <TabsTrigger value="caretaker-invoices">Caretaker invoices</TabsTrigger>
          <TabsTrigger value="fire-certificates">Fire certificates</TabsTrigger>
          <TabsTrigger value="contractor-history">Contractor history</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Users</h2>
                <p className="text-muted-foreground">
                  Manage user accounts and permissions
                </p>
              </div>
              <AddUser />
            </div>
            <UsersTable />
          </div>
        </TabsContent>

        <TabsContent value="condominios" className="mt-4">
          <CrudSection
            title="Condominiums"
            description="CRUD allowed only for role 3."
            queryKey={["condominios"]}
            listFn={CondominiosService.readCondominios}
            createFn={(payload) =>
              CondominiosService.createCondominio({
                requestBody: payload as { nome: string },
              })
            }
            updateFn={(id, payload) =>
              CondominiosService.updateCondominio({
                id,
                requestBody: payload as { nome?: string },
              })
            }
            deleteFn={(id) => CondominiosService.deleteCondominio({ id })}
            defaultCreatePayload={{ nome: "OakHillPark" }}
          />
        </TabsContent>

        <TabsContent value="buildings" className="mt-4">
          <CrudSection
            title="Buildings"
            description="CRUD allowed for roles 0, 1 and 2."
            queryKey={["buildings"]}
            listFn={BuildingsService.readBuildings}
            createFn={(payload) =>
              BuildingsService.createBuilding({
                requestBody: payload as {
                  nome: string
                  condominio_id: string
                },
              })
            }
            updateFn={(id, payload) =>
              BuildingsService.updateBuilding({
                id,
                requestBody: payload as {
                  nome?: string
                  condominio_id?: string
                },
              })
            }
            deleteFn={(id) => BuildingsService.deleteBuilding({ id })}
            defaultCreatePayload={{
              nome: "Block A",
              condominio_id: "",
            }}
          />
        </TabsContent>

        <TabsContent value="flats" className="mt-4">
          <CrudSection
            title="Flats"
            description="CRUD allowed for roles 0, 1 and 2."
            queryKey={["flats"]}
            listFn={FlatsService.readFlats}
            createFn={(payload) =>
              FlatsService.createFlat({
                requestBody: payload as {
                  numero: number
                  status: boolean
                  building_id: string
                },
              })
            }
            updateFn={(id, payload) =>
              FlatsService.updateFlat({
                id,
                requestBody: payload as {
                  numero?: number
                  status?: boolean
                  building_id?: string
                },
              })
            }
            deleteFn={(id) => FlatsService.deleteFlat({ id })}
            defaultCreatePayload={{
              numero: 101,
              status: true,
              building_id: "",
            }}
          />
        </TabsContent>

        <TabsContent value="moradores" className="mt-4">
          <CrudSection
            title="Residents"
            description="CRUD allowed for roles 0, 1 and 2."
            queryKey={["moradores"]}
            listFn={MoradoresService.readMoradores}
            createFn={(payload) =>
              MoradoresService.createMorador({
                requestBody: payload as {
                  cargo: number
                  nome: string
                  email?: string | null
                  mobile: number
                  car1?: string | null
                  car2?: string | null
                  car3?: string | null
                  flat_id: string
                },
              })
            }
            updateFn={(id, payload) =>
              MoradoresService.updateMorador({
                id,
                requestBody: payload as {
                  cargo?: number
                  nome?: string
                  email?: string | null
                  mobile?: number
                  car1?: string | null
                  car2?: string | null
                  car3?: string | null
                  flat_id?: string
                },
              })
            }
            deleteFn={(id) => MoradoresService.deleteMorador({ id })}
            defaultCreatePayload={{
              cargo: 0,
              nome: "Resident",
              email: "",
              mobile: 0,
              car1: null,
              car2: null,
              car3: null,
              flat_id: "",
            }}
          />
        </TabsContent>

        <TabsContent value="funcionarios" className="mt-4">
          <CrudSection
            title="Staff"
            description="CRUD allowed for roles 0, 1 and 2."
            queryKey={["funcionarios"]}
            listFn={FuncionariosService.readFuncionarios}
            createFn={(payload) =>
              FuncionariosService.createFuncionario({
                requestBody: payload as {
                  status: boolean
                  nome: string
                  mobile: number
                  cargo: number
                  email?: string | null
                  condominio_id: string
                },
              })
            }
            updateFn={(id, payload) =>
              FuncionariosService.updateFuncionario({
                id,
                requestBody: payload as {
                  status?: boolean
                  nome?: string
                  mobile?: number
                  cargo?: number
                  email?: string | null
                  condominio_id?: string
                },
              })
            }
            deleteFn={(id) => FuncionariosService.deleteFuncionario({ id })}
            defaultCreatePayload={{
              status: true,
              nome: "Staff member",
              mobile: 0,
              cargo: 1,
              email: "",
              condominio_id: "",
            }}
          />
        </TabsContent>

        <TabsContent value="acess" className="mt-4">
          <CrudSection
            title="Access"
            description="Create allowed for role 0. CRUD for roles 0 and 1."
            queryKey={["acess"]}
            listFn={AcessService.readAcesses}
            createFn={(payload) =>
              AcessService.createAcess({
                requestBody: payload as {
                  status: boolean
                  data?: string | null
                  operacao: number
                  building_id: string
                },
              })
            }
            updateFn={(id, payload) =>
              AcessService.updateAcess({
                id,
                requestBody: payload as {
                  status?: boolean
                  data?: string | null
                  operacao?: number
                  building_id?: string
                },
              })
            }
            deleteFn={(id) => AcessService.deleteAcess({ id })}
            defaultCreatePayload={{
              status: true,
              operacao: 0,
              building_id: "",
            }}
          />
        </TabsContent>

        <TabsContent value="readings" className="mt-4">
          <CrudSection
            title="Readings"
            description="CRUD allowed for roles 0, 1 and 2."
            queryKey={["readings"]}
            listFn={ReadingsService.readReadings}
            createFn={(payload) =>
              ReadingsService.createReading({
                requestBody: payload as {
                  data?: string | null
                  tipo: number
                  valor: number
                  building_id: string
                },
              })
            }
            updateFn={(id, payload) =>
              ReadingsService.updateReading({
                id,
                requestBody: payload as {
                  data?: string | null
                  tipo?: number
                  valor?: number
                  building_id?: string
                },
              })
            }
            deleteFn={(id) => ReadingsService.deleteReading({ id })}
            defaultCreatePayload={{
              tipo: 0,
              valor: 0,
              building_id: "",
            }}
            searchPlaceholder="Search readings"
          />
        </TabsContent>

        <TabsContent value="cash-flow" className="mt-4">
          <CrudSection
            title="Cash flow"
            description="Manager-level finance records with monthly numbering and invoice support."
            queryKey={["cash-flow"]}
            listFn={CashFlowService.readRecords}
            createFn={(payload) =>
              CashFlowService.createRecord({
                requestBody: payload as {
                  has_invoice: boolean
                  invoice_media_name?: string | null
                  invoice_media_data?: string | null
                  record_date: string
                  amount: number
                  description: string
                },
              })
            }
            updateFn={(id, payload) =>
              CashFlowService.updateRecord({
                id,
                requestBody: payload as {
                  has_invoice?: boolean
                  invoice_media_name?: string | null
                  invoice_media_data?: string | null
                  record_date?: string
                  amount?: number
                  description?: string
                },
              })
            }
            deleteFn={(id) => CashFlowService.deleteRecord({ id })}
            defaultCreatePayload={{
              has_invoice: false,
              invoice_media_name: null,
              invoice_media_data: null,
              record_date: today,
              amount: 0,
              description: "Manual adjustment",
            }}
            searchPlaceholder="Search finance records"
            renderMeta={(result) => {
              const cashFlowResult = result as typeof result & {
                balance?: number
                next_payment_number?: number
              }
              return (
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="rounded-md border px-3 py-1">
                    Balance: {cashFlowResult.balance ?? 0}
                  </span>
                  <span className="rounded-md border px-3 py-1">
                    Next payment number: {cashFlowResult.next_payment_number ?? "-"}
                  </span>
                </div>
              )
            }}
          />
        </TabsContent>

        <TabsContent value="reminders" className="mt-4">
          <CrudSection
            title="Reminders"
            description="Recurring operational reminders with SMS and task automation."
            queryKey={["reminders"]}
            listFn={RemindersService.readReminders}
            createFn={(payload) =>
              RemindersService.createReminder({
                requestBody: payload as {
                  name: string
                  schedule_unit: string
                  schedule_mode: string
                  interval_value?: number | null
                  weekday_mask: number
                  month_mask?: number | null
                  is_active: boolean
                  action_sms: boolean
                  sms_to?: string | null
                  sms_message?: string | null
                  action_task: boolean
                  task_title?: string | null
                  task_description?: string | null
                },
              })
            }
            updateFn={(id, payload) =>
              RemindersService.updateReminder({
                id,
                requestBody: payload as {
                  name?: string
                  schedule_unit?: string
                  schedule_mode?: string
                  interval_value?: number | null
                  weekday_mask?: number | null
                  month_mask?: number | null
                  is_active?: boolean
                  action_sms?: boolean
                  sms_to?: string | null
                  sms_message?: string | null
                  action_task?: boolean
                  task_title?: string | null
                  task_description?: string | null
                },
              })
            }
            deleteFn={(id) => RemindersService.deleteReminder({ id })}
            defaultCreatePayload={{
              name: "Weekly site check",
              schedule_unit: "week",
              schedule_mode: "fixed",
              interval_value: null,
              weekday_mask: 2,
              month_mask: null,
              is_active: true,
              action_sms: false,
              sms_to: null,
              sms_message: null,
              action_task: true,
              task_title: "Site check",
              task_description: "Follow up the scheduled check",
            }}
            searchPlaceholder="Search reminders"
            toolbarActions={[
              {
                label: "Run due now",
                onClick: () => executeRemindersMutation.mutate(),
                isPending: executeRemindersMutation.isPending,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="cleaner-invoices" className="mt-4">
          <CrudSection
            title="Cleaner invoices"
            description="Upload and review cleaner invoices generated for the active condominium."
            queryKey={["cleaner-invoices"]}
            listFn={CleanerInvoicesService.readCleanerInvoices}
            createFn={(payload) =>
              CleanerInvoicesService.createCleanerInvoice({
                requestBody: payload as {
                  invoice_date: string
                  media_name?: string | null
                  media_data: string
                },
              })
            }
            defaultCreatePayload={{
              invoice_date: today,
              media_name: "cleaner-invoice.txt",
              media_data: sampleMediaData,
            }}
            searchPlaceholder="Search cleaner invoices"
          />
        </TabsContent>

        <TabsContent value="caretaker-invoices" className="mt-4">
          <CrudSection
            title="Caretaker invoices"
            description="Upload and review caretaker invoices generated for the active condominium."
            queryKey={["caretaker-invoices"]}
            listFn={CaretakerInvoicesService.readCaretakerInvoices}
            createFn={(payload) =>
              CaretakerInvoicesService.createCaretakerInvoice({
                requestBody: payload as {
                  invoice_date: string
                  media_name?: string | null
                  media_data: string
                },
              })
            }
            defaultCreatePayload={{
              invoice_date: today,
              media_name: "caretaker-invoice.txt",
              media_data: sampleMediaData,
            }}
            searchPlaceholder="Search caretaker invoices"
          />
        </TabsContent>

        <TabsContent value="fire-certificates" className="mt-4">
          <CrudSection
            title="Fire alarm certificates"
            description="Manage uploaded external fire alarm certificate records by building."
            queryKey={["fire-alarm-external-certificates"]}
            listFn={FireAlarmExternalCertificatesService.readFireAlarmExternalCertificates}
            createFn={(payload) =>
              FireAlarmExternalCertificatesService.createFireAlarmExternalCertificate({
                requestBody: payload as {
                  building_id: string
                  certificate_date: string
                  media_1_name?: string | null
                  media_1_data?: string | null
                  media_2_name?: string | null
                  media_2_data?: string | null
                },
              })
            }
            updateFn={(id, payload) =>
              FireAlarmExternalCertificatesService.updateFireAlarmExternalCertificate({
                id,
                requestBody: payload as {
                  building_id: string
                  certificate_date: string
                  media_1_name?: string | null
                  media_1_data?: string | null
                  media_2_name?: string | null
                  media_2_data?: string | null
                },
              })
            }
            deleteFn={(id) =>
              FireAlarmExternalCertificatesService.deleteFireAlarmExternalCertificate({
                id,
              })
            }
            defaultCreatePayload={{
              building_id: "",
              certificate_date: today,
              media_1_name: "certificate-1.txt",
              media_1_data: sampleMediaData,
              media_2_name: null,
              media_2_data: null,
            }}
            searchPlaceholder="Search fire certificates"
          />
        </TabsContent>

        <TabsContent value="contractor-history" className="mt-4">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold">Contractor history</h2>
              <p className="text-sm text-muted-foreground">
                Manage contractor categories, histories, scheduling, and follow-up notifications.
              </p>
            </div>
            <ContractorHistoryContent />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
