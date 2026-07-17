import { expect, test } from "@playwright/test"

test("public cash flow links show readonly records and invoice media", async ({
  page,
}) => {
  await page.route("**/api/v1/cash-flow/shared/share-token", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "record-1",
            payment_number: 1,
            has_invoice: true,
            invoice_media_name: "invoice.png",
            invoice_media_data: "data:image/png;base64,aGVsbG8=",
            record_date: "2026-03-10",
            amount: -25,
            supplier: "Northwind",
            description: "Invoice in range",
          },
        ],
        count: 1,
        date_from: "2026-03-10",
        date_to: "2026-03-31",
        credits_total: 0,
        debits_total: -25,
        balance: -25,
      }),
    })
  })

  await page.goto("/cash-flow/share/share-token")

  await expect(page.getByRole("heading", { name: "Shared Petty Cash" })).toBeVisible()
  await expect(page.getByText("Invoice in range")).toBeVisible()
  await expect(page.getByText("Northwind")).toBeVisible()
  await expect(page.getByRole("button", { name: "View invoice" })).toBeVisible()
  await expect(page.getByText("-£25.00")).toBeVisible()
  await expect(page.getByRole("button", { name: "New record" })).not.toBeVisible()
})
