import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

test("building SMS selection uses readings consent while manual selection bypasses it", async ({
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
        data: [{ id: "falcon-id", nome: "Falcon", reading_types: 3 }],
        count: 1,
      },
    })
  })
  await page.route("**/api/v1/moradores/**", async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: "reading-consented-resident",
            cargo: 0,
            building_nome: "Falcon",
            flat_numero: 1,
            flat_label: null,
            flat_id: "falcon-flat-1",
            nome: "Receives readings",
            email: "receives@example.com",
            mobile: "07700 900001",
            receives_flat_reading_sms: true,
            receives_twilio_sms: false,
            reading_types: 0,
          },
          {
            id: "manual-selection-resident",
            cargo: 2,
            building_nome: "Falcon",
            flat_numero: 2,
            flat_label: null,
            flat_id: "falcon-flat-2",
            nome: "Manual selection",
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

  await main.getByLabel("Falcon", { exact: true }).check()
  await main
    .getByText("Manual selection", { exact: true })
    .locator("xpath=ancestor::label")
    .getByRole("checkbox")
    .check()
  await main.locator("#twilio-message-body").fill("Building update")
  await main.getByRole("button", { name: "Send bulk SMS" }).click()

  await expect(
    main.getByRole("heading", { name: "Send result" }),
  ).toBeVisible()
  await expect.poll(() => sentSmsPayloads).toEqual([
    { phone_to: "+447700900001", body: "Building update" },
    { phone_to: "+447700900002", body: "Building update" },
  ])
})

test("email channel keeps every resident available for manual selection", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "twilio-email-consent-test-token")
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
  await page.route(
    "**/api/v1/contractor-access/history/execute-due",
    async (route) => {
      await route.fulfill({ json: { triggered: 0 } })
    },
  )
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
            id: "email-consented-resident",
            cargo: 0,
            building_nome: "Northwood",
            flat_numero: 1,
            flat_label: null,
            flat_id: "northwood-flat-1",
            nome: "Receives Email",
            email: "receives@example.com",
            mobile: "07700 900001",
            receives_flat_reading_sms: false,
            receives_twilio_sms: false,
            receives_twilio_email: true,
            reading_types: 0,
          },
          {
            id: "email-unconsented-resident",
            cargo: 2,
            building_nome: "Northwood",
            flat_numero: 2,
            flat_label: null,
            flat_id: "northwood-flat-2",
            nome: "Does Not Receive Email",
            email: "does-not-receive@example.com",
            mobile: "07700 900002",
            receives_flat_reading_sms: false,
            receives_twilio_sms: false,
            receives_twilio_email: false,
            reading_types: 0,
          },
          {
            id: "office-resident",
            cargo: 3,
            building_nome: "Office",
            flat_numero: 3,
            flat_label: null,
            flat_id: "office-flat-3",
            nome: "Office manual selection",
            email: "office@example.com",
            mobile: "07700 900003",
            receives_flat_reading_sms: false,
            receives_twilio_sms: false,
            receives_twilio_email: false,
            reading_types: 0,
          },
        ],
        count: 2,
      },
    })
  })

  await page.goto("/dashboard")

  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Twilio", exact: true }).click()
  await main.getByRole("button", { name: "Email", exact: true }).click()

  await expect(main.getByText("Receives Email", { exact: true })).toBeVisible()
  const unconsentedResident = main
    .getByText("Does Not Receive Email", { exact: true })
    .locator("xpath=ancestor::label")
  await expect(unconsentedResident).toBeVisible()
  await unconsentedResident.getByRole("checkbox").check()
  await expect(unconsentedResident.getByRole("checkbox")).toBeChecked()
  await expect(
    main.getByText("Office manual selection", { exact: true }),
  ).toBeVisible()
})
