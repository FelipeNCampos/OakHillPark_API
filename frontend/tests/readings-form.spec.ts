import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

const buildingId = "11111111-1111-1111-1111-111111111111"
const flatId = "22222222-2222-2222-2222-222222222222"
const readingsFormUrl = `http://127.0.0.1:5173/readings-form?buildingId=${buildingId}`

const formData = {
  building: {
    id: buildingId,
    nome: "Falcon",
    reading_types: 3,
  },
  flats: [
    {
      id: flatId,
      numero: 4,
      label: "4A",
      reading_types: 6,
    },
  ],
}

const mockReadingsFormApi = async (page: import("@playwright/test").Page) => {
  await page.route(`**/api/v1/readings/public/${buildingId}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: formData })
      return
    }
    await route.fulfill({ json: { building_readings: 1, flat_readings: 1 } })
  })
}

test("readings form switches between building and flat fields", async ({
  page,
}) => {
  await mockReadingsFormApi(page)
  await page.goto(readingsFormUrl)
  const formPanel = page.locator(".mobile-page-panel")

  await expect(
    page.getByRole("heading", { name: "Readings - Falcon" }),
  ).toBeVisible()
  await expect(formPanel.getByLabel("Low")).toBeVisible()
  await expect(formPanel.getByLabel("Normal")).toBeVisible()
  await expect(formPanel.getByLabel("Gas")).toHaveCount(0)

  await page.getByRole("button", { name: "Flats" }).click()

  await expect(formPanel.getByText("Flat 4A")).toBeVisible()
  await expect(formPanel.getByLabel("Normal")).toBeVisible()
  await expect(formPanel.getByLabel("Gas")).toBeVisible()
  await expect(formPanel.getByLabel("Low")).toHaveCount(0)
})

test("readings form sends only filled values", async ({ page }) => {
  let submission: unknown
  await page.route(`**/api/v1/readings/public/${buildingId}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: formData })
      return
    }
    submission = route.request().postDataJSON()
    await route.fulfill({ json: { building_readings: 1, flat_readings: 1 } })
  })
  await page.goto(readingsFormUrl)
  const formPanel = page.locator(".mobile-page-panel")

  await formPanel.getByLabel("Low").fill("100")
  await page.getByRole("button", { name: "Flats" }).click()
  await formPanel.getByLabel("Gas").fill("200")
  await page.getByRole("button", { name: "Submit readings" }).click()

  await expect
    .poll(() => submission)
    .toEqual({
      building_readings: [{ tipo: 1, valor: 100 }],
      flat_readings: [{ flat_id: flatId, tipo: 4, valor: 200 }],
    })
})

test("readings form confirms a successful submission and closes the tab on OK", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.close = () => {
      document.documentElement.dataset.windowClosed = "true"
    }
  })
  await mockReadingsFormApi(page)
  await page.goto(readingsFormUrl)

  await page.getByLabel("Low").fill("100")
  await page.getByRole("button", { name: "Submit readings" }).click()

  const confirmation = page.getByRole("dialog", {
    name: "Readings sent successfully",
  })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole("button", { name: "OK" }).click()
  await expect(page.locator("html")).toHaveAttribute(
    "data-window-closed",
    "true",
  )
})
