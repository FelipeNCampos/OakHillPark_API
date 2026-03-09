import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

import { type UserPublic, UsersService } from "@/client"
import {
  AcessService,
  BuildingsService,
  CondominiosService,
  FlatsService,
  FuncionariosService,
  MoradoresService,
  ReadingsService,
} from "@/client/admin"
import AddUser from "@/components/Admin/AddUser"
import CrudSection from "@/components/Admin/CrudSection"
import { columns, type UserTableData } from "@/components/Admin/columns"
import { DataTable } from "@/components/Common/DataTable"
import PendingUsers from "@/components/Pending/PendingUsers"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

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
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">
          Manage users and new condo registrations.
        </p>
      </div>
      <Tabs defaultValue="users">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="condominios">Condominiums</TabsTrigger>
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="flats">Flats</TabsTrigger>
          <TabsTrigger value="moradores">Residents</TabsTrigger>
          <TabsTrigger value="funcionarios">Staff</TabsTrigger>
          <TabsTrigger value="acess">Access</TabsTrigger>
          <TabsTrigger value="readings">Readings</TabsTrigger>
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
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
