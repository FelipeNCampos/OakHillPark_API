import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

test("readings QR codes exclude caretaker, cleaner and estate buildings", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "readings-qr-test-token")
  })
  await page.route("**/api/v1/users/me", async (route) => {
    await route.fulfill({
      json: {
        id: "user-id",
        email: "manager@example.com",
        full_name: "Manager",
        cargo: 2,
        is_superuser: true,
        condominio_id: "condominio-id",
      },
    })
  })
  await page.route("**/api/v1/buildings/condominio", async (route) => {
    await route.fulfill({
      json: {
        data: [
          { id: "falcon", nome: "Falcon", reading_types: 3 },
          { id: "caretaker", nome: "Caretaker", reading_types: 0 },
          { id: "cleaner", nome: "Cleaner", reading_types: 0 },
          { id: "estate", nome: "Estate OHP", reading_types: 0 },
        ],
        count: 4,
      },
    })
  })

  await page.goto("http://127.0.0.1:5173/dashboard")
  await page
    .getByRole("main")
    .getByRole("button", { name: "Readings", exact: true })
    .click()

  await expect(
    page.getByRole("heading", { name: "QR Codes - Readings" }),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Falcon" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Caretaker" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Cleaner" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Estate OHP" })).toHaveCount(0)
})
