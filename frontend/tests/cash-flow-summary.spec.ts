import { expect, test } from "@playwright/test"

test.use({
  storageState: { cookies: [], origins: [] },
})

test("cash flow footer sums visible values alongside the balance", async ({
  page,
}) => {
  const records = [
    {
      id: "credit-record",
      payment_number: 1,
      has_invoice: false,
      record_date: "2026-08-01",
      amount: 1200.5,
      supplier: "Income",
      description: "Credit",
      location: "Building",
      reason: "Deposit",
      created_at: "2026-08-01T10:00:00Z",
    },
    {
      id: "debit-record",
      payment_number: 2,
      has_invoice: false,
      record_date: "2026-08-02",
      amount: -300.25,
      supplier: "Supplier",
      description: "Debit",
      location: "Building",
      reason: "Invoice",
      created_at: "2026-08-02T10:00:00Z",
    },
  ]

  await page.addInitScript(() => {
    localStorage.setItem("access_token", "cash-flow-summary-test-token")
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
    const isCumulativeBalanceRequest = !new URL(
      route.request().url(),
    ).searchParams.has("date_from")

    await route.fulfill({
      json: {
        data: records,
        count: records.length,
        balance: isCumulativeBalanceRequest ? 450 : 900.25,
        next_payment_number: 3,
      },
    })
  })

  await page.goto("/dashboard")
  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Petty Cash", exact: true }).click()

  const summaryCells = main
    .getByRole("table")
    .getByRole("row", { name: /Total:/ })
    .locator("td")

  await expect(summaryCells.nth(1)).toHaveText("Total")
  await expect(summaryCells.nth(2)).toHaveText("£900.25")
  await expect(summaryCells.nth(4)).toHaveText("Total:")
  await expect(summaryCells.nth(5)).toHaveText("£450.00")
})
