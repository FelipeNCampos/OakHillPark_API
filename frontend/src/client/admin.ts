import type { CancelablePromise } from "./core/CancelablePromise"
import { OpenAPI } from "./core/OpenAPI"
import { request as __request } from "./core/request"

export type ListResponse<T> = {
  data: T[]
  count: number
}

export type MessageResponse = {
  message: string
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
  reading_types?: number
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

export type MoradorWithFlatPublic = {
  id: string
  cargo: number
  nome: string
  email?: string | null
  mobile: number
  car1?: string | null
  car2?: string | null
  car3?: string | null
  flat_id: string
  flat_numero: number
  building_nome: string
  reading_types: number
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

export type CashFlowRecordPublic = {
  id: string
  payment_number: number
  has_invoice: boolean
  invoice_media_name?: string | null
  invoice_media_data?: string | null
  record_date: string
  amount: number
  description: string
  condominio_id: string
  created_by_user_id: string
  created_at: string
}

export type CashFlowRecordsPublic = ListResponse<CashFlowRecordPublic> & {
  balance: number
  next_payment_number: number
}

export type CashFlowRecordCreate = {
  has_invoice: boolean
  invoice_media_name?: string | null
  invoice_media_data?: string | null
  record_date: string
  amount: number
  description: string
}

export type ReminderPublic = {
  id: string
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
  condominio_id: string
  created_by_user_id: string
  last_triggered_on?: string | null
  last_triggered_at?: string | null
  created_at: string
  updated_at: string
}

export type ReminderCreate = {
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
}

export type ReminderUpdate = {
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
}

export type ReminderExecutionSummary = {
  checked: number
  triggered: number
  sms_sent: number
  tasks_created: number
}

export type CleanerInvoicePublic = {
  id: string
  invoice_date: string
  media_name?: string | null
  media_data: string
  condominio_id: string
  created_by_user_id: string
  created_at: string
}

export type CleanerInvoiceCreate = {
  invoice_date: string
  media_name?: string | null
  media_data: string
}

export type CaretakerInvoicePublic = {
  id: string
  invoice_date: string
  media_name?: string | null
  media_data: string
  condominio_id: string
  created_by_user_id: string
  created_at: string
}

export type CaretakerInvoiceCreate = {
  invoice_date: string
  media_name?: string | null
  media_data: string
}

export type FireAlarmExternalCertificatePublic = {
  id: string
  condominio_id: string
  building_id?: string | null
  building_name?: string | null
  certificate_date: string
  media_1_name?: string | null
  media_1_data?: string | null
  media_2_name?: string | null
  media_2_data?: string | null
  created_by_user_id: string
  created_at: string
}

export type FireAlarmExternalCertificateCreate = {
  building_id: string
  certificate_date: string
  media_1_name?: string | null
  media_1_data?: string | null
  media_2_name?: string | null
  media_2_data?: string | null
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
  deleteCondominio: (data: { id: string }): CancelablePromise<MessageResponse> =>
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
  deleteBuilding: (data: { id: string }): CancelablePromise<MessageResponse> =>
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
  deleteFlat: (data: { id: string }): CancelablePromise<MessageResponse> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/flats/{id}",
      path: { id: data.id },
    }),
}

export const MoradoresService = {
  readMoradores: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<MoradorWithFlatPublic>> =>
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
  updateMoradorReadingTypes: (data: { id: string; reading_types: number }): CancelablePromise<MoradorWithFlatPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/moradores/{id}/reading-types",
      path: { id: data.id },
      body: data.reading_types,
      mediaType: "application/json",
    }),
  deleteMorador: (data: { id: string }): CancelablePromise<MessageResponse> =>
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
  deleteFuncionario: (data: { id: string }): CancelablePromise<MessageResponse> =>
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
  deleteAcess: (data: { id: string }): CancelablePromise<MessageResponse> =>
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
  deleteReading: (data: { id: string }): CancelablePromise<MessageResponse> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/readings/{id}",
      path: { id: data.id },
    }),
}

export const CashFlowService = {
  readRecords: (data: {
    skip?: number
    limit?: number
    date_from?: string
    date_to?: string
    search?: string
  } = {}): CancelablePromise<CashFlowRecordsPublic> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/cash-flow/",
      query: {
        skip: data.skip,
        limit: data.limit,
        date_from: data.date_from,
        date_to: data.date_to,
        search: data.search,
      },
    }),
  createRecord: (data: {
    requestBody: CashFlowRecordCreate
  }): CancelablePromise<CashFlowRecordPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/cash-flow/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateRecord: (data: {
    id: string
    requestBody: Partial<CashFlowRecordCreate>
  }): CancelablePromise<CashFlowRecordPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/cash-flow/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteRecord: (data: { id: string }): CancelablePromise<MessageResponse> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/cash-flow/{id}",
      path: { id: data.id },
    }),
}

export const RemindersService = {
  readReminders: (data: { skip?: number; limit?: number } = {}): CancelablePromise<ListResponse<ReminderPublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/reminds/",
      query: { skip: data.skip, limit: data.limit },
    }),
  createReminder: (data: { requestBody: ReminderCreate }): CancelablePromise<ReminderPublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/reminds/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateReminder: (data: {
    id: string
    requestBody: ReminderUpdate
  }): CancelablePromise<ReminderPublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/reminds/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteReminder: (data: { id: string }): CancelablePromise<MessageResponse> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/reminds/{id}",
      path: { id: data.id },
    }),
  executeDueReminders: (): CancelablePromise<ReminderExecutionSummary> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/reminds/execute-due",
    }),
}

export const CleanerInvoicesService = {
  readCleanerInvoices: (data: {
    skip?: number
    limit?: number
    date_from?: string
    date_to?: string
  } = {}): CancelablePromise<ListResponse<CleanerInvoicePublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/cleaner-invoices/",
      query: {
        skip: data.skip,
        limit: data.limit,
        date_from: data.date_from,
        date_to: data.date_to,
      },
    }),
  createCleanerInvoice: (data: {
    requestBody: CleanerInvoiceCreate
  }): CancelablePromise<CleanerInvoicePublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/cleaner-invoices/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
}

export const CaretakerInvoicesService = {
  readCaretakerInvoices: (data: {
    skip?: number
    limit?: number
    date_from?: string
    date_to?: string
  } = {}): CancelablePromise<ListResponse<CaretakerInvoicePublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/caretaker-invoices/",
      query: {
        skip: data.skip,
        limit: data.limit,
        date_from: data.date_from,
        date_to: data.date_to,
      },
    }),
  createCaretakerInvoice: (data: {
    requestBody: CaretakerInvoiceCreate
  }): CancelablePromise<CaretakerInvoicePublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/caretaker-invoices/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
}

export const FireAlarmExternalCertificatesService = {
  readFireAlarmExternalCertificates: (data: {
    skip?: number
    limit?: number
    search?: string
    date_from?: string
    date_to?: string
  } = {}): CancelablePromise<ListResponse<FireAlarmExternalCertificatePublic>> =>
    __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/fire-alarm-external-certificates/",
      query: {
        skip: data.skip,
        limit: data.limit,
        search: data.search,
        date_from: data.date_from,
        date_to: data.date_to,
      },
    }),
  createFireAlarmExternalCertificate: (data: {
    requestBody: FireAlarmExternalCertificateCreate
  }): CancelablePromise<FireAlarmExternalCertificatePublic> =>
    __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/fire-alarm-external-certificates/",
      body: data.requestBody,
      mediaType: "application/json",
    }),
  updateFireAlarmExternalCertificate: (data: {
    id: string
    requestBody: FireAlarmExternalCertificateCreate
  }): CancelablePromise<FireAlarmExternalCertificatePublic> =>
    __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/fire-alarm-external-certificates/{id}",
      path: { id: data.id },
      body: data.requestBody,
      mediaType: "application/json",
    }),
  deleteFireAlarmExternalCertificate: (data: {
    id: string
  }): CancelablePromise<MessageResponse> =>
    __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/fire-alarm-external-certificates/{id}",
      path: { id: data.id },
    }),
}
