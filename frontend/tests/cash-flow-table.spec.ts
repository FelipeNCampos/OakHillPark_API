import { expect, test } from "@playwright/test"

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 800, height: 900 },
})

test("cash flow rows keep the table compact and open the complete editor on row click", async ({
  page,
}) => {
  const record = {
    id: "cash-flow-record-id",
    payment_number: 42,
    has_invoice: true,
    invoice_media_name: "invoice.pdf",
    invoice_media_data: "data:application/pdf;base64,JVBERi0xLjQ=",
    record_date: "2026-08-05",
    amount: -1234.56,
    supplier: "Very long supplier name that must remain available in the compact table",
    description:
      "A detailed description that must be shortened instead of expanding the row",
    location: "Northwood building management office",
    reason: "Emergency maintenance and replacement work",
    created_at: "2026-08-05T10:00:00Z",
  }

  await page.addInitScript(() => {
    localStorage.setItem("access_token", "cash-flow-table-test-token")
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
  await page.route("**/api/v1/cash-flow/**", async (route) => {
    const isCumulativeBalanceRequest = !new URL(route.request().url()).searchParams.has(
      "date_from",
    )

    await route.fulfill({
      json: {
        data: [record],
        count: 1,
        balance: isCumulativeBalanceRequest ? -900 : record.amount,
        next_payment_number: 43,
      },
    })
  })

  await page.goto("/dashboard")

  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Petty Cash", exact: true }).click()
  await expect(
    main.getByRole("heading", { name: "Petty Cash" }),
  ).toBeVisible()

  const table = main.getByRole("table")
  const recordRow = table.getByRole("row", { name: /#42/ })
  const recordCells = recordRow.locator("td")

  await expect(table.getByRole("columnheader", { name: /actions?/i })).toHaveCount(0)
  await expect(table.getByRole("button", { name: "✏️ View" })).toBeVisible()
  await expect(recordCells.nth(2)).toHaveCSS("white-space", "nowrap")
  await expect(recordCells.nth(3)).toHaveCSS("white-space", "nowrap")
  await expect(recordCells.nth(8)).toHaveCSS("white-space", "nowrap")
  await expect(recordRow.getByTitle(record.supplier)).toBeVisible()
  const tableDimensions = await table.evaluate((tableElement) => {
    const container = tableElement.parentElement
    return {
      containerWidth: container?.clientWidth || 0,
      tableScrollWidth: tableElement.scrollWidth,
    }
  })
  expect(tableDimensions.tableScrollWidth).toBeLessThanOrEqual(
    tableDimensions.containerWidth,
  )

  const summaryRow = table.getByRole("row", { name: /Total:/ })
  await expect(summaryRow.getByText("£900.00")).toBeVisible()

  await recordRow.click()

  const editor = page.getByRole("dialog", { name: "Edit record" })
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel("Payment number")).toHaveValue("42")
  await expect(editor.getByLabel("Date")).toHaveValue("2026-08-05")
  await expect(editor.getByLabel("Value")).toHaveValue("-1234.56")
  await expect(editor.getByLabel("Supplier")).toHaveValue(record.supplier)
  await expect(editor.getByLabel("Comments")).toHaveValue(record.description)
  await expect(editor.getByLabel("Location")).toHaveValue(record.location)
  await expect(editor.getByLabel("Reason")).toHaveValue(record.reason)
  await expect(editor.getByText("Invoice media", { exact: true })).toBeVisible()
  await expect(editor.getByText(record.invoice_media_name)).toBeVisible()
  await expect(
    editor.getByRole("button", { name: "Delete record" }),
  ).toBeVisible()
  await expect(editor.getByRole("button", { name: "Cancel" })).toBeVisible()
  await expect(
    editor.getByRole("button", { name: "Save changes" }),
  ).toBeVisible()
  await expect(
    editor.getByRole("button", { name: /move to cashflow 52/i }),
  ).toHaveCount(0)

  await expect(main.getByRole("button", { name: "Edit record" })).toHaveCount(0)
})
