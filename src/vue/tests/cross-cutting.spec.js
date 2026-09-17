import { expect, test } from "./fixtures"
import { iconButton, toolRow, waitForRowSettled } from "./helpers"

test.describe("14. Cross-Cutting Concerns", () => {
    test.fixme("14.1 a Galaxy 500/502 error shows a user-facing banner with no blank page", async () => {
        // Flagged (TODO) in RUN_SHEET.md as impractical to force manually. Actually tractable
        // via the mock (e.g. `route.fulfill({ status: 500, json: { error: "...", tools: {} } })`
        // for GET /api/galaxy/tools/, which router/index.js already handles by setting
        // job.galaxy_error and rendering it via the v-banner in HomeView/CategoryView/
        // NotFoundView) - left as a follow-up rather than expanding this pass's scope.
    })

    test.fixme("14.2 a non-JSON/malformed API response doesn't crash the page", async () => {
        // Flagged (TODO) in RUN_SHEET.md.
    })

    test("14.3 resizing across the mdAndUp breakpoint with a menu open causes no duplicated controls", async ({
        loggedInPage: page
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto("")

        await iconButton(page, "mdi-account-circle").click()
        await expect(page.getByText("Logged in as scientist@ornl.gov")).toBeVisible()

        await page.setViewportSize({ width: 400, height: 800 })

        await expect(page.getByText("Logged in as scientist@ornl.gov")).toHaveCount(1)
        await expect(iconButton(page, "mdi-menu")).toBeVisible()
    })

    test("14.4 header controls and a tool row's buttons are keyboard operable", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)
        const startButton = row.getByRole("button", { name: "Start" })

        await startButton.focus()
        await expect(startButton).toBeFocused()
        await page.keyboard.press("Enter")

        await expect(row.getByText("Launching application...")).toBeVisible()
    })
})
