import { expect, test } from "@playwright/test"

test.use({
  storageState: { cookies: [], origins: [] },
})

test("cash flow uses a customized date period and returns to a single month", async ({
  page,
}) => {
  const rangeRequests: Array<{ dateFrom: string | null; dateTo: string | null }> =
    []

  await page.addInitScript(() => {
    localStorage.setItem("access_token", "cash-flow-period-test-token")
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
  await page.route("**/api/v1/cash-flow/**", async (route) => {
    const requestUrl = new URL(route.request().url())
    const dateFrom = requestUrl.searchParams.get("date_from")
    const dateTo = requestUrl.searchParams.get("date_to")
    if (dateFrom) rangeRequests.push({ dateFrom, dateTo })

    await route.fulfill({
      json: {
        data: [],
        count: 0,
        balance: 0,
        next_payment_number: 1,
      },
    })
  })

  await page.goto("/dashboard")

  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Petty Cash", exact: true }).click()

  await main
    .getByRole("button", { name: "Customize cash flow period" })
    .click()

  const periodDialog = page.getByRole("dialog", {
    name: "Customize cash flow period",
  })
  await periodDialog.getByLabel("Start date").fill("2026-06-10")
  await periodDialog.getByLabel("End date").fill("2026-07-05")
  await periodDialog.getByRole("button", { name: "Apply period" }).click()

  await expect(main.getByText("Customized", { exact: true })).toBeVisible()
  await expect.poll(() =>
    rangeRequests.some(
      (request) =>
        request.dateFrom === "2026-06-10" && request.dateTo === "2026-07-05",
    ),
  ).toBe(true)

  await main.getByLabel("Month").fill("2025-12")

  await expect(main.getByText("Customized", { exact: true })).toHaveCount(0)
  await expect.poll(() =>
    rangeRequests.some(
      (request) =>
        request.dateFrom === "2025-12-01" && request.dateTo === "2025-12-31",
    ),
  ).toBe(true)
})
