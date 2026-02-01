import type { CancelablePromise } from "./core/CancelablePromise"
import { OpenAPI } from "./core/OpenAPI"
import { request as __request } from "./core/request"

export type ListResponse<T> = {
  data: T[]
  count: number
}

export type CondominioPublic = {
  id: string
  nome: string
}

export type BuildingPublic = {
  id: string
  nome: string
  condominio_id: string
}

export type FlatPublic = {
  id: string
  numero: number
  status: boolean
  building_id: string
}

export type MoradorPublic = {
  id: string
  cargo: number
  nome: string
  email?: string | null
  mobile: number
  car1?: string | null
  car2?: string | null
  car3?: string | null
  flat_id: string
}

export type FuncionarioPublic = {
  id: string
  status: boolean
  nome: string
  mobile: number
  cargo: number
  email?: string | null
  condominio_id: string
}

export type AcessPublic = {
  id: string
  status: boolean
  data?: string | null
  operacao: number
  building_id: string
}

export type ReadingsPublic = {
  id: string
  data?: string | null
  tipo: number
  valor: number
  building_id: string
}

export const CondominiosService = {
  readCondominios: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<CondominioPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/condominios/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createCondominio: (data: { requestBody: { nome: string } }): CancelablePromise<CondominioPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/condominios/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateCondominio: (data: { id: string; requestBody: { nome?: string } }): CancelablePromise<CondominioPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/condominios/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteCondominio: (data: { id: string }): CancelablePromise<{ message: string }> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/condominios/{id}",
      path: { id: data.id },
    }),
}

export const BuildingsService = {
  readBuildings: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<BuildingPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/buildings/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createBuilding: (data: { requestBody: { nome: string; condominio_id: string } }): CancelablePromise<BuildingPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/buildings/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateBuilding: (data: { id: string; requestBody: { nome?: string; condominio_id?: string } }): CancelablePromise<BuildingPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/buildings/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteBuilding: (data: { id: string }): CancelablePromise<{ message: string }> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/buildings/{id}",
      path: { id: data.id },
    }),
}

export const FlatsService = {
  readFlats: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<FlatPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/flats/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createFlat: (data: { requestBody: { numero: number; status: boolean; building_id: string } }): CancelablePromise<FlatPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/flats/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateFlat: (data: { id: string; requestBody: { numero?: number; status?: boolean; building_id?: string } }): CancelablePromise<FlatPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/flats/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteFlat: (data: { id: string }): CancelablePromise<{ message: string }> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/flats/{id}",
      path: { id: data.id },
    }),
}

export const MoradoresService = {
  readMoradores: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<MoradorPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/moradores/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createMorador: (data: { requestBody: Omit<MoradorPublic, "id"> }): CancelablePromise<MoradorPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/moradores/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateMorador: (data: { id: string; requestBody: Partial<Omit<MoradorPublic, "id">> }): CancelablePromise<MoradorPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/moradores/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteMorador: (data: { id: string }): CancelablePromise<{ message: string }> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/moradores/{id}",
      path: { id: data.id },
    }),
}

export const FuncionariosService = {
  readFuncionarios: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<FuncionarioPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/funcionarios/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createFuncionario: (data: { requestBody: Omit<FuncionarioPublic, "id"> }): CancelablePromise<FuncionarioPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/funcionarios/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateFuncionario: (data: { id: string; requestBody: Partial<Omit<FuncionarioPublic, "id">> }): CancelablePromise<FuncionarioPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/funcionarios/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteFuncionario: (data: { id: string }): CancelablePromise<{ message: string }> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/funcionarios/{id}",
      path: { id: data.id },
    }),
}

export const AcessService = {
  readAcesses: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<AcessPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/acess/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createAcess: (data: { requestBody: Omit<AcessPublic, "id"> }): CancelablePromise<AcessPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/acess/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateAcess: (data: { id: string; requestBody: Partial<Omit<AcessPublic, "id">> }): CancelablePromise<AcessPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/acess/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteAcess: (data: { id: string }): CancelablePromise<{ message: string }> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/acess/{id}",
      path: { id: data.id },
    }),
}

export const ReadingsService = {
  readReadings: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<ReadingsPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/readings/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createReading: (data: { requestBody: Omit<ReadingsPublic, "id"> }): CancelablePromise<ReadingsPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/readings/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateReading: (data: { id: string; requestBody: Partial<Omit<ReadingsPublic, "id">> }): CancelablePromise<ReadingsPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/readings/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteReading: (data: { id: string }): CancelablePromise<{ message: string }> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/readings/{id}",
      path: { id: data.id },
    }),
}
