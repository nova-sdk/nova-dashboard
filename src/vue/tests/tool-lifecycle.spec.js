import { advanceJobPoll, expect, test } from "./fixtures"
import { toolRow, waitForRowSettled } from "./helpers"

const TOOL_URL = "https://tool.invalid/reduce"

async function stubToolUrl(page) {
    await page
        .context()
        .route(`${TOOL_URL}**`, (route) =>
            route.fulfill({ body: "<html></html>", contentType: "text/html" })
        )
}

test.describe("4. Tool Launch / Stop Lifecycle (ToolListItem)", () => {
    test("4.1 logged out: launch button is disabled with 'Sign in to run apps'", async ({
        loggedOutPage: page
    }) => {
        await page.goto("imaging")

        await expect(
            toolRow(page, "Reduce").getByRole("button", { name: "Sign in to run apps" })
        ).toBeDisabled()
    })

    test("4.2 logged in, before the first monitor poll resolves: 'Checking login status'", async ({
        loggedInPage: page,
        jobController
    }) => {
        let releaseMonitor
        const gate = new Promise((resolve) => {
            releaseMonitor = resolve
        })
        await page.route("**/api/galaxy/monitor/", async (route) => {
            await gate
            await route.fulfill({ json: { jobs: jobController.list() } })
        })

        await page.goto("imaging")

        const row = toolRow(page, "Reduce")
        await expect(row.getByRole("button", { name: "Checking login status" })).toBeDisabled()

        releaseMonitor()
        await expect(row.getByRole("button", { name: "Checking login status" })).toHaveCount(0)
    })

    test("4.3 clicking Start immediately shows a spinner and status text", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        await row.getByRole("button", { name: "Start" }).click()

        await expect(row.getByText("Launching application...")).toBeVisible()
        await expect(row.locator(".v-progress-circular")).toBeVisible()
    })

    test("4.4 a launch pending 10s+ without a URL shows a slow-launch warning", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        await row.getByRole("button", { name: "Start" }).click()
        await page.clock.runFor(10200)

        const warningIcon = row.locator("i.mdi-information-outline")
        await expect(warningIcon).toBeVisible()

        await warningIcon.hover()
        await expect(page.getByText("This is taking longer than usual")).toBeVisible()
        await expect(
            page.getByText(/compute node may be updating your tool's Docker image/)
        ).toBeVisible()
    })

    test("4.5 a running job with a ready URL shows Open and Stop", async ({
        loggedInPage: page,
        jobController
    }) => {
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        const launchResponse = page.waitForResponse("**/api/galaxy/launch/")
        await row.getByRole("button", { name: "Start" }).click()
        await launchResponse

        jobController.setState("nova_reduce", { state: "running", url: TOOL_URL, url_ready: true })
        await advanceJobPoll(page)

        await expect(row.getByRole("link", { name: "Open" })).toBeVisible()
        await expect(row.getByRole("button", { name: "Stop" })).toBeVisible()
    })

    test("4.6 clicking Open opens the tool URL in a new tab", async ({
        loggedInPage: page,
        jobController
    }) => {
        await stubToolUrl(page)
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        const launchResponse = page.waitForResponse("**/api/galaxy/launch/")
        await row.getByRole("button", { name: "Start" }).click()
        await launchResponse

        jobController.setState("nova_reduce", { state: "running", url: TOOL_URL, url_ready: true })
        await advanceJobPoll(page)

        const openLink = row.getByRole("link", { name: "Open" })
        await expect(openLink).toBeVisible()

        const [newTab] = await Promise.all([page.context().waitForEvent("page"), openLink.click()])
        await newTab.waitForLoadState()
        expect(newTab.url()).toBe(TOOL_URL)
    })

    test("4.7 the auto-open preference opens a launched tool automatically once ready", async ({
        loggedInPage: page,
        jobController
    }) => {
        await stubToolUrl(page)
        await page.addInitScript(() => localStorage.setItem("autoopen", "true"))
        // Auto-open only applies where startMonitor's allow_autoopen is true - that's the
        // category page (CategoryView.vue: job.startMonitor(true, ...)), not Home.
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        const launchResponse = page.waitForResponse("**/api/galaxy/launch/")
        await row.getByRole("button", { name: "Start" }).click()
        await launchResponse

        const newTabPromise = page.context().waitForEvent("page")
        jobController.setState("nova_reduce", { state: "running", url: TOOL_URL, url_ready: true })
        await advanceJobPoll(page)

        const newTab = await newTabPromise
        expect(newTab.url()).toBe(TOOL_URL)
    })

    test("4.8 stopping a ready tool returns the row to the launchable state", async ({
        loggedInPage: page,
        jobController
    }) => {
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        const launchResponse = page.waitForResponse("**/api/galaxy/launch/")
        await row.getByRole("button", { name: "Start" }).click()
        await launchResponse

        jobController.setState("nova_reduce", { state: "running", url: TOOL_URL, url_ready: true })
        await advanceJobPoll(page)
        await expect(row.getByRole("button", { name: "Stop" })).toBeVisible()

        const stopResponse = page.waitForResponse("**/api/galaxy/stop/")
        await row.getByRole("button", { name: "Stop" }).click()
        await expect(row.getByText("Stopping application...")).toBeVisible()
        await stopResponse

        await advanceJobPoll(page)
        await expect(row.getByRole("button", { name: "Start" })).toBeVisible()
    })

    test("4.9 a tool that finishes shows a 5s auto-dismissing snackbar", async ({
        loggedInPage: page,
        jobController
    }) => {
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        const launchResponse = page.waitForResponse("**/api/galaxy/launch/")
        await row.getByRole("button", { name: "Start" }).click()
        await launchResponse

        // A real job spends at least one poll in a running state before finishing.
        jobController.setState("nova_reduce", { state: "running", url: TOOL_URL, url_ready: true })
        await advanceJobPoll(page)
        await expect(row.getByRole("button", { name: "Stop" })).toBeVisible()

        jobController.setState("nova_reduce", { state: "ok" })
        await advanceJobPoll(page)

        // v-snackbar teleports its content out of the row's own DOM subtree (into a
        // .v-overlay-container near <body>), so it has to be located page-wide rather than
        // scoped to `row` - the row itself simply reverts to a launchable "Start" state once
        // the job reads "ok" (canLaunch() doesn't treat "ok" as still-running).
        const snackbar = page.getByText("Reduce finished running.")
        await expect(snackbar).toBeVisible()
        await page.clock.runFor(5100)
        await expect(snackbar).not.toBeVisible()
    })

    test.fixme("4.10 a launch error shows a red error banner with the tool's reported error", async () => {
        // Flagged (TODO) in RUN_SHEET.md as impractical to force manually. It is technically
        // reachable via the mock (jobController.setState(id, { state: "error", error: "..." })),
        // but is left as a follow-up rather than expanding this pass's scope.
    })

    test.fixme("4.11 the clipboard-copy icon copies the auto-launch link", async () => {
        // Flagged (TODO) in RUN_SHEET.md. Tractable with page.context().grantPermissions(
        // ["clipboard-read", "clipboard-write"]) plus navigator.clipboard.readText() - left
        // as a follow-up.
    })

    test.fixme("4.12 a tool with a documentation link renders a working doc button", async () => {
        // Flagged (TODO) in RUN_SHEET.md. IMAGING_TOOL_WITH_DOCS (mocks/tools.js) already
        // provides a fixture tool with a `documentation` URL for whenever this is unskipped.
    })

    test("4.13 a tool with no documentation link renders no documentation button", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")

        await expect(toolRow(page, "Reduce").locator("i.mdi-file-document")).toHaveCount(0)
    })
})
