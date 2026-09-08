import { expect, test } from "@playwright/test"

test.use({
  storageState: { cookies: [], origins: [] },
})

test("cash flow searches all records when All is selected", async ({
  page,
}) => {
  const searchRequests: URL[] = []

  await page.addInitScript(() => {
    localStorage.setItem("access_token", "cash-flow-all-search-test-token")
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
    if (requestUrl.searchParams.get("search") === "historic supplier") {
      searchRequests.push(requestUrl)
    }

    await route.fulfill({
      json: { data: [], count: 0, balance: 0, next_payment_number: 1 },
    })
  })

  await page.goto("/dashboard")

  const main = page.getByRole("main")
  await main.getByRole("button", { name: "Petty Cash", exact: true }).click()
  await main.getByLabel("Search all records").check()
  await main
    .getByPlaceholder("Search by Supplier or Comments")
    .fill("historic supplier")

  await expect
    .poll(() =>
      searchRequests.some(
        (request) =>
          !request.searchParams.has("date_from") &&
          !request.searchParams.has("date_to"),
      ),
    )
    .toBe(true)

  searchRequests.length = 0
  await main.getByLabel("Search all records").uncheck()

  await expect
    .poll(() =>
      searchRequests.some(
        (request) =>
          request.searchParams.has("date_from") &&
          request.searchParams.has("date_to"),
      ),
    )
    .toBe(true)
})
