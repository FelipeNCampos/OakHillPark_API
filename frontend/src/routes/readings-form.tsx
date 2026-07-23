import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"

import { OpenAPI } from "@/client"
import { enforceHttpsUrl, resolveApiBase } from "@/config/api"
import useCustomToast from "@/hooks/useCustomToast"

const searchSchema = z.object({
  buildingId: z.string().optional().catch(""),
})

const READING_FIELDS = [
  { key: "low", label: "Low", tipo: 1 },
  { key: "normal", label: "Normal", tipo: 2 },
  { key: "gas", label: "Gas", tipo: 4 },
  { key: "garage", label: "Garage", tipo: 8 },
] as const

type ReadingFieldKey = (typeof READING_FIELDS)[number]["key"]
type FormValues = Partial<Record<ReadingFieldKey, string>>

type PublicReadingsForm = {
  building: {
    id: string
    nome: string
    reading_types: number
  }
  flats: Array<{
    id: string
    numero: number
    label: string | null
    reading_types: number
  }>
}

type PublicSubmission = {
  building_readings: Array<{ tipo: number; valor: number }>
  flat_readings: Array<{ flat_id: string; tipo: number; valor: number }>
}

const publicApiCall = async (endpoint: string, options?: RequestInit) => {
  const response = await fetch(
    enforceHttpsUrl(`${resolveApiBase(OpenAPI.BASE)}${endpoint}`),
    {
      headers: { "Content-Type": "application/json" },
      ...options,
    },
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail || "Unable to send readings")
  }
  return response.json()
}

const getFieldsForReadingTypes = (readingTypes: number) =>
  READING_FIELDS.filter((field) => (readingTypes & field.tipo) !== 0)

const flatLabel = (flat: PublicReadingsForm["flats"][number]) =>
  flat.label?.trim() ? `Flat ${flat.label.trim()}` : `Flat ${flat.numero}`

export const Route = createFileRoute("/readings-form" as any)({
  component: ReadingsForm,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Readings - OakHill Park" }] }),
})

function ReadingsForm() {
  const { buildingId } = Route.useSearch() as z.infer<typeof searchSchema>
  const { showErrorToast } = useCustomToast()
  const [form, setForm] = useState<PublicReadingsForm | null>(null)
  const [mode, setMode] = useState<"building" | "flats">("building")
  const [buildingValues, setBuildingValues] = useState<FormValues>({})
  const [flatValues, setFlatValues] = useState<Record<string, FormValues>>({})
  const [isLoading, setIsLoading] = useState(Boolean(buildingId))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccessConfirmationOpen, setIsSuccessConfirmationOpen] =
    useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!buildingId) {
      setIsLoading(false)
      setError("Invalid QR code.")
      return
    }

    let active = true
    setIsLoading(true)
    setError("")
    publicApiCall(`/api/v1/readings/public/${buildingId}`)
      .then((payload: PublicReadingsForm) => {
        if (!active) return
        setForm(payload)
      })
      .catch((requestError: unknown) => {
        if (!active) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Invalid QR code.",
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [buildingId])

  const updateBuildingValue = (key: ReadingFieldKey, value: string) => {
    setBuildingValues((current) => ({ ...current, [key]: value }))
  }

  const updateFlatValue = (
    flatId: string,
    key: ReadingFieldKey,
    value: string,
  ) => {
    setFlatValues((current) => ({
      ...current,
      [flatId]: { ...current[flatId], [key]: value },
    }))
  }

  const handleSubmit = async () => {
    if (!form || !buildingId) return

    const submission: PublicSubmission = {
      building_readings: [],
      flat_readings: [],
    }
    const appendValue = (
      value: string | undefined,
      append: (numericValue: number) => void,
    ) => {
      if (!value?.trim()) return true
      const numericValue = Number(value)
      if (!Number.isInteger(numericValue)) return false
      append(numericValue)
      return true
    }

    for (const field of getFieldsForReadingTypes(form.building.reading_types)) {
      if (
        !appendValue(buildingValues[field.key], (valor) =>
          submission.building_readings.push({ tipo: field.tipo, valor }),
        )
      ) {
        showErrorToast("Reading values must be whole numbers")
        return
      }
    }
    for (const flat of form.flats) {
      for (const field of getFieldsForReadingTypes(flat.reading_types)) {
        if (
          !appendValue(flatValues[flat.id]?.[field.key], (valor) =>
            submission.flat_readings.push({
              flat_id: flat.id,
              tipo: field.tipo,
              valor,
            }),
          )
        ) {
          showErrorToast("Reading values must be whole numbers")
          return
        }
      }
    }

    if (
      !submission.building_readings.length &&
      !submission.flat_readings.length
    ) {
      showErrorToast("Add at least one reading value")
      return
    }

    setIsSubmitting(true)
    try {
      await publicApiCall(`/api/v1/readings/public/${buildingId}`, {
        method: "POST",
        body: JSON.stringify(submission),
      })
      setBuildingValues({})
      setFlatValues({})
      setIsSuccessConfirmationOpen(true)
    } catch (requestError) {
      showErrorToast(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send readings",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <PageMessage message="Loading readings form..." />
  }
  if (error || !form) {
    return <PageMessage message={error || "Invalid QR code."} isError />
  }

  const buildingFields = getFieldsForReadingTypes(form.building.reading_types)

  const handleSuccessConfirmation = () => {
    setIsSuccessConfirmationOpen(false)
    window.close()
  }

  return (
    <div className="mobile-page-shell min-h-screen bg-[#f5f1ee] px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mobile-page-panel rounded-2xl bg-white p-5 shadow-lg sm:p-8">
          <h1 className="text-center text-2xl font-bold text-[#55311c]">
            Readings - {form.building.nome}
          </h1>
          <p className="mt-2 text-center text-sm text-[rgba(0,0,0,0.7)]">
            Fill only the readings collected and submit them together.
          </p>

          <div className="mt-6 flex rounded-2xl bg-[#f5f1ee] p-1">
            {(["building", "flats"] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  mode === tab
                    ? "bg-[#8c7569] text-white shadow"
                    : "text-[#55311c] hover:bg-[#e8e1dc]"
                }`}
              >
                {tab === "building" ? "Building" : "Flats"}
              </button>
            ))}
          </div>

          {mode === "building" ? (
            <section className="mt-6">
              {buildingFields.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {buildingFields.map((field) => (
                    <ReadingInput
                      key={field.key}
                      label={field.label}
                      value={buildingValues[field.key] || ""}
                      onChange={(value) =>
                        updateBuildingValue(field.key, value)
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-[#f5f1ee] p-4 text-sm text-[#55311c]">
                  This building has no configured readings.
                </p>
              )}
            </section>
          ) : (
            <section className="mt-6 space-y-4">
              {form.flats.length ? (
                form.flats.map((flat) => (
                  <div
                    key={flat.id}
                    className="rounded-xl border border-[#e5e0dc] p-4"
                  >
                    <h2 className="font-semibold text-[#55311c]">
                      {flatLabel(flat)}
                    </h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {getFieldsForReadingTypes(flat.reading_types).map(
                        (field) => (
                          <ReadingInput
                            key={field.key}
                            label={field.label}
                            value={flatValues[flat.id]?.[field.key] || ""}
                            onChange={(value) =>
                              updateFlatValue(flat.id, field.key, value)
                            }
                          />
                        ),
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-[#f5f1ee] p-4 text-sm text-[#55311c]">
                  No flats with configured readings were found.
                </p>
              )}
            </section>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="mt-6 w-full rounded-lg bg-[#8c7569] px-6 py-3 text-lg font-semibold text-white transition-all duration-300 hover:bg-[#55311c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Sending..." : "Submit readings"}
          </button>
        </div>
      </div>

      {isSuccessConfirmationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="readings-success-title"
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
          >
            <h2
              id="readings-success-title"
              className="text-xl font-bold text-[#55311c]"
            >
              Readings sent successfully
            </h2>
            <p className="mt-2 text-sm text-[rgba(0,0,0,0.7)]">
              Your readings have been sent.
            </p>
            <button
              type="button"
              onClick={handleSuccessConfirmation}
              className="mt-6 w-full rounded-lg bg-[#8c7569] px-4 py-2 font-semibold text-white transition-all duration-200 hover:bg-[#55311c]"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReadingInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-sm font-semibold text-[#55311c]">
      {label}
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-[#ddd] px-4 py-2 text-[#55311c] focus:border-[#8c7569] focus:outline-none"
      />
    </label>
  )
}

function PageMessage({
  message,
  isError = false,
}: {
  message: string
  isError?: boolean
}) {
  return (
    <div className="mobile-page-shell flex min-h-screen items-center justify-center bg-[#f5f1ee] px-4">
      <p
        className={`rounded-xl bg-white p-6 text-center shadow-lg ${
          isError ? "text-red-700" : "text-[#55311c]"
        }`}
      >
        {message}
      </p>
    </div>
  )
}
