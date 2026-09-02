import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

test("building and flat reading rows open the editor without an Actions column", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "readings-table-test-token")
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
          {
            id: "building-id",
            nome: "Falcon",
            reading_types: 3,
            flats: [
              {
                id: "flat-id",
                numero: 1,
                label: null,
                reading_types: 3,
              },
            ],
          },
        ],
        count: 1,
      },
    })
  })
  await page.route("**/api/v1/readings/**", async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: "building-low-reading-id",
            data: "2026-07-20T00:00:00",
            tipo: 1,
            valor: 120,
          },
          {
            id: "building-normal-reading-id",
            data: "2026-07-20T00:00:00",
            tipo: 2,
            valor: 240,
          },
        ],
        count: 2,
      },
    })
  })
  await page.route("**/api/v1/flat_readings/**", async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: "flat-low-reading-id",
            data: "2026-07-20T00:00:00",
            tipo: 1,
            valor: 20,
          },
          {
            id: "flat-normal-reading-id",
            data: "2026-07-20T00:00:00",
            tipo: 2,
            valor: 40,
          },
          {
            id: "flat-previous-low-reading-id",
            data: "2026-07-10T00:00:00",
            tipo: 1,
            valor: 10,
          },
          {
            id: "flat-previous-normal-reading-id",
            data: "2026-07-10T00:00:00",
            tipo: 2,
            valor: 30,
          },
        ],
        count: 4,
      },
    })
  })

  await page.goto("http://127.0.0.1:5173/dashboard")

  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Buildings", exact: true }).click()
  await expect(
    main.getByRole("heading", { name: "Buildings - Readings" }),
  ).toBeVisible()
  await expect(main.getByRole("columnheader", { name: "Actions" })).toHaveCount(
    0,
  )
  await main.getByRole("row", { name: /All.*20\/07\/2026.*120.*240/ }).click()
  await expect(
    page.getByRole("heading", { name: "Edit readings" }),
  ).toBeVisible()

  await page.reload()
  await main.getByRole("button", { name: "Flats", exact: true }).click()
  await expect(
    main.getByRole("heading", { name: "Flats - Readings" }),
  ).toBeVisible()
  await main.getByRole("button", { name: "Flat 1", exact: true }).click()
  await expect(main.getByRole("columnheader", { name: "Actions" })).toHaveCount(
    0,
  )
  const latestFlatRow = main.locator("tbody tr").first()
  await expect(latestFlatRow).toHaveText(
    /10\s*20\/07\/2026\s*20\s*10\s*-\s*40\s*10\s*-/,
  )
  await expect(latestFlatRow).not.toContainText("All")
  await latestFlatRow.click()
  await expect(
    page.getByRole("heading", { name: "Edit readings" }),
  ).toBeVisible()
})
