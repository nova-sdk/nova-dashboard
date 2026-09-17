import { advanceJobPoll, expect, test } from "./fixtures"

test.describe("2. Home Page", () => {
    test("2.1 shows one card per category, excluding generic-tools, with name + description", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await expect(page.getByText("Imaging", { exact: true })).toBeVisible()
        await expect(page.getByText("Imaging techniques and tools.")).toBeVisible()
        await expect(page.getByText("Scattering", { exact: true })).toBeVisible()
        await expect(page.getByText("Generic Tools", { exact: true })).toHaveCount(0)
    })

    test("2.2 clicking a category card navigates to /{category-key}", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await page.getByText("Imaging", { exact: true }).click()
        await expect(page).toHaveURL(/\/imaging$/)
    })

    test("2.3 job monitoring begins on the home page", async ({ loggedInPage: page }) => {
        let monitorCalls = 0
        await page.route("**/api/galaxy/monitor/", async (route) => {
            monitorCalls++
            await route.fulfill({ json: { jobs: [] } })
        })

        await page.goto("")
        // The first monitorJobs() call happens synchronously on mount, but only sends a
        // request once the user's API key has resolved - advancing past a full poll
        // interval guarantees at least one call regardless of that race.
        await advanceJobPoll(page)

        await expect.poll(() => monitorCalls).toBeGreaterThan(0)
    })
})
