import { advanceJobPoll, expect, test } from "./fixtures"
import { iconButton, toolRow, waitForRowSettled } from "./helpers"

const TOOL_URL = "https://tool.invalid/reduce"

function activeToolsButton(page) {
    return iconButton(page, "mdi-laptop")
}

function activeToolsPanel(page) {
    return page.locator(".v-card", { hasText: "Active Tools" })
}

async function launchAndReady(page, jobController) {
    const row = toolRow(page, "Reduce")
    await waitForRowSettled(row)

    const launchResponse = page.waitForResponse("**/api/galaxy/launch/")
    await row.getByRole("button", { name: "Start" }).click()
    await launchResponse

    jobController.setState("nova_reduce", { state: "running", url: TOOL_URL, url_ready: true })
    await advanceJobPoll(page)
}

test.describe("6. Active Tools Panel & Externally-Launched Tools", () => {
    test("6.1 the header badge shows the running-tool count", async ({
        loggedInPage: page,
        jobController
    }) => {
        await page.goto("imaging")
        await launchAndReady(page, jobController)

        const button = activeToolsButton(page)
        await expect(button).toBeVisible()
        await expect(button.locator(".v-badge__badge")).toHaveText("1")
    })

    test("6.2 with zero running tools, the Active Tools icon is hidden", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")

        // The button is hidden via v-show (App.vue), not v-if, so it's still present in the
        // DOM - just not visible.
        await expect(activeToolsButton(page)).not.toBeVisible()
    })

    test("6.3 clicking the Active Tools icon lists each running tool", async ({
        loggedInPage: page,
        jobController
    }) => {
        await page.goto("imaging")
        await launchAndReady(page, jobController)

        await activeToolsButton(page).click()

        await expect(activeToolsPanel(page).getByText(/\bReduce\b/)).toBeVisible()
    })

    test("6.4 a tool launched outside the dashboard is labeled and its Open/Stop work", async ({
        loggedInPage: page,
        jobController
    }) => {
        jobController.seedJob("nova_reduce", { url: TOOL_URL, url_ready: true })
        await page.goto("imaging")
        await advanceJobPoll(page)

        await activeToolsButton(page).click()
        const panel = activeToolsPanel(page)

        await expect(panel.getByText("Launched outside of dashboard.")).toBeVisible()
        await expect(panel.getByRole("link", { name: "Open" })).toBeVisible()
        await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible()
    })

    test("6.5 a datafile-triggered tool shows its autolaunch parameters", async ({
        loggedInPage: page,
        jobController
    }) => {
        jobController.seedJob("nova_datafile_tool", {
            is_extra_tool: false,
            is_datafile_tool: true,
            url: TOOL_URL,
            url_ready: true,
            parameters: { sample: "sample.nxs" }
        })
        await page.goto("imaging")
        await advanceJobPoll(page)

        await activeToolsButton(page).click()

        await expect(
            activeToolsPanel(page).getByText("Autolaunched with parameters: sample: sample.nxs")
        ).toBeVisible()
    })
})
