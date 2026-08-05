import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

test("sending SMS to a building excludes residents without Twilio consent", async ({
  page,
}) => {
  const sentSmsPayloads: Array<{ phone_to: string; body: string }> = []

  await page.addInitScript(() => {
    localStorage.setItem("access_token", "twilio-bulk-sms-test-token")
  })

  await page.route("**/api/v1/users/me", async (route) => {
    await route.fulfill({
      json: {
        id: "manager-id",
        email: "manager@example.com",
        full_name: "Manager",
        cargo: 2,
        is_superuser: true,
        condominio_id: "condominio-id",
      },
    })
  })
  await page.route("**/api/v1/contractor-access/history/execute-due", async (route) => {
    await route.fulfill({ json: { triggered: 0 } })
  })
  await page.route("**/api/v1/buildings/condominio**", async (route) => {
    await route.fulfill({
      json: {
        data: [{ id: "northwood-id", nome: "Northwood", reading_types: 3 }],
        count: 1,
      },
    })
  })
  await page.route("**/api/v1/moradores/**", async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: "consented-resident",
            cargo: 0,
            building_nome: "Northwood",
            flat_numero: 1,
            flat_label: null,
            flat_id: "northwood-flat-1",
            nome: "Receives SMS",
            email: "receives@example.com",
            mobile: "07700 900001",
            receives_flat_reading_sms: false,
            receives_twilio_sms: true,
            reading_types: 0,
          },
          {
            id: "unconsented-resident",
            cargo: 2,
            building_nome: "Northwood",
            flat_numero: 2,
            flat_label: null,
            flat_id: "northwood-flat-2",
            nome: "Does Not Receive SMS",
            email: "does-not-receive@example.com",
            mobile: "07700 900002",
            receives_flat_reading_sms: false,
            receives_twilio_sms: false,
            reading_types: 0,
          },
        ],
        count: 2,
      },
    })
  })
  await page.route("**/api/v1/utils/send-sms/", async (route) => {
    sentSmsPayloads.push(route.request().postDataJSON())
    await route.fulfill({ json: { message: "queued" } })
  })

  await page.goto("/dashboard")

  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Twilio", exact: true }).click()
  await expect(main.getByRole("heading", { name: "Messaging" })).toBeVisible()

  await main.getByLabel("Northwood", { exact: true }).check()
  await main.locator("#twilio-message-body").fill("Building update")
  await main.getByRole("button", { name: "Send bulk SMS" }).click()

  await expect(
    main.getByRole("heading", { name: "Send result" }),
  ).toBeVisible()
  await expect.poll(() => sentSmsPayloads).toEqual([
    { phone_to: "+447700900001", body: "Building update" },
  ])
})
