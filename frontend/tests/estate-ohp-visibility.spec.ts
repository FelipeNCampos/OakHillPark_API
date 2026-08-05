import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

test("Estate OHP is hidden from resident and reading building selectors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "estate-ohp-visibility-test-token")
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
  await page.route("**/api/v1/buildings/condominio**", async (route) => {
    await route.fulfill({
      json: {
        data: [
          { id: "falcon", nome: "Falcon", reading_types: 3, flats: [] },
          { id: "estate", nome: "Estate OHP", reading_types: 3, flats: [] },
          { id: "state", nome: "State OHP", reading_types: 3, flats: [] },
        ],
        count: 3,
      },
    })
  })
  await page.route("**/api/v1/moradores/**", async (route) => {
    await route.fulfill({ json: { data: [], count: 0 } })
  })

  await page.goto("/dashboard")

  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Residents", exact: true }).click()
  await expect(main.getByRole("heading", { name: "Residents" })).toBeVisible()
  await expect(
    main.locator("#residents-building option").filter({ hasText: "Estate OHP" }),
  ).toHaveCount(0)
  await expect(
    main.locator("#residents-building option").filter({ hasText: "State OHP" }),
  ).toHaveCount(0)
  await expect(
    main.locator("#residents-building option").filter({ hasText: "Falcon" }),
  ).toHaveCount(1)

  await page.reload()
  await main.getByRole("button", { name: "Buildings", exact: true }).click()
  await expect(
    main.getByRole("heading", { name: "Buildings - Readings" }),
  ).toBeVisible()
  await expect(main.getByRole("button", { name: "Estate OHP", exact: true })).toHaveCount(0)
  await expect(main.getByRole("button", { name: "Falcon", exact: true })).toBeVisible()

  await page.reload()
  await main.getByRole("button", { name: "Flats", exact: true }).click()
  await expect(
    main.getByRole("heading", { name: "Flats - Readings" }),
  ).toBeVisible()
  await expect(main.getByRole("button", { name: "Estate OHP", exact: true })).toHaveCount(0)
  await expect(main.getByRole("button", { name: "Falcon", exact: true })).toBeVisible()
})
