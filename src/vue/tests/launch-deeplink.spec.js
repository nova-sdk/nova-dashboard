import { advanceJobPoll, expect, test } from "./fixtures"

const TOOL_URL = "https://tool.invalid/reduce"

async function stubToolUrl(page) {
    await page
        .context()
        .route(`${TOOL_URL}**`, (route) =>
            route.fulfill({ body: "<html></html>", contentType: "text/html" })
        )
}

/** Counts requests to /api/galaxy/launch/ while still letting the fixture's mock handle them. */
async function countLaunches(page) {
    const state = { count: 0 }
    await page.route("**/api/galaxy/launch/", async (route) => {
        state.count++
        await route.fallback()
    })
    return state
}

test.describe("5. Auto-Launch Deep Links (/launch/:tool)", () => {
    test("5.1 logged out: prompts to log in first, with no header Login button", async ({
        loggedOutPage: page
    }) => {
        await page.goto("launch/nova_reduce")

        await expect(
            page.getByText("You must log in before your tool can be launched.")
        ).toBeVisible()
        // Only one Login link on the page confirms the header's own Login button (hidden by
        // DesktopLayout/MobileLayout's `!route.path.startsWith("/launch")` check) is absent.
        await expect(page.getByRole("link", { name: "Login" })).toHaveCount(1)
    })

    test("5.2 the login link redirects back to the same /launch/:tool URL", async ({
        loggedOutPage: page
    }) => {
        await page.goto("launch/nova_reduce")

        await expect(page.getByRole("link", { name: "Login" })).toHaveAttribute(
            "href",
            "http://galaxy.invalid/login/start?redirect=/launch/nova_reduce"
        )
    })

    test("5.3 no existing job, no query params: launches automatically exactly once", async ({
        loggedInPage: page
    }) => {
        const launches = await countLaunches(page)

        await page.goto("launch/nova_reduce")
        // Poll 1: has_monitored flips true, but too late in this same cycle to auto-launch
        // (job.js's monitorCallback runs before the nextTick that sets has_monitored).
        await advanceJobPoll(page)
        // Poll 2: has_monitored is now true, so monitorCallback auto-launches.
        await advanceJobPoll(page)

        await expect.poll(() => launches.count).toBe(1)

        // Further polls must not launch it again.
        await advanceJobPoll(page)
        await advanceJobPoll(page)
        expect(launches.count).toBe(1)
    })

    test("5.4 an already-running job for the tool is reused, not relaunched", async ({
        loggedInPage: page,
        jobController
    }) => {
        jobController.seedJob("nova_reduce", {
            is_extra_tool: false,
            state: "running",
            url: TOOL_URL,
            url_ready: true
        })
        const launches = await countLaunches(page)

        await page.goto("launch/nova_reduce")
        await advanceJobPoll(page)
        await advanceJobPoll(page)

        expect(launches.count).toBe(0)
    })

    test("5.5 a parameterized deep link always launches a new job", async ({
        loggedInPage: page,
        jobController
    }) => {
        jobController.seedJob("nova_datafile_tool", {
            is_extra_tool: false,
            is_datafile_tool: true,
            state: "running",
            url: TOOL_URL,
            url_ready: true
        })

        let lastBody = null
        const launches = await countLaunches(page)
        await page.route("**/api/galaxy/launch/", async (route) => {
            lastBody = route.request().postDataJSON()
            await route.fallback()
        })

        await page.goto("launch/nova_datafile_tool?sample=sample.nxs")
        await advanceJobPoll(page)

        await expect.poll(() => launches.count).toBe(1)
        expect(lastBody.inputs).toEqual({ sample: "sample.nxs" })
    })

    test("5.6 while waiting, ToolStatus shows a connecting spinner and status text", async ({
        loggedInPage: page
    }) => {
        let releaseMonitor
        const gate = new Promise((resolve) => {
            releaseMonitor = resolve
        })
        await page.route("**/api/galaxy/monitor/", async (route) => {
            await gate
            await route.fulfill({ json: { jobs: [] } })
        })

        await page.goto("launch/nova_reduce")

        await expect(page.getByText("Connecting to NDIP...")).toBeVisible()
        // Scoped to the card - the footer also has its own (always-present) progress circular.
        await expect(page.locator(".v-card").getByRole("progressbar")).toBeVisible()

        releaseMonitor()
    })

    test.fixme("5.7 a forced launch error shows a static error banner", async () => {
        // Flagged (TODO) in RUN_SHEET.md as impractical to force manually.
    })

    test("5.8 & 5.9 a ready tool hard-redirects via location.replace without a new history entry", async ({
        loggedInPage: page,
        jobController
    }) => {
        await stubToolUrl(page)

        await page.goto("imaging")
        await expect(page.getByText("Imaging Applications")).toBeVisible()

        const launchResponse = page.waitForResponse("**/api/galaxy/launch/")
        await page.goto("launch/nova_reduce")
        await advanceJobPoll(page) // poll 1: has_monitored flips true
        await advanceJobPoll(page) // poll 2: auto-launches
        await launchResponse

        jobController.setState("nova_reduce", { state: "running", url: TOOL_URL, url_ready: true })
        await advanceJobPoll(page) // poll 3: detects readiness, hard-redirects

        await page.waitForURL(TOOL_URL)

        // 5.9 regression: Back should skip over /launch/nova_reduce entirely, since
        // location.replace() overwrote that history entry rather than pushing a new one.
        await page.goBack()
        await expect(page).toHaveURL(/\/imaging$/)
    })

    test("5.10 an unknown tool id redirects to the 404 view", async ({ loggedInPage: page }) => {
        await page.goto("launch/not-a-real-tool")

        await expect(page.getByText("The content you requested could not be found.")).toBeVisible()
    })

    test.fixme("5.11 an auto-launch link copied from a tool row works end-to-end in a private window", async () => {
        // Depends on 4.11's clipboard copy, itself flagged (TODO) in RUN_SHEET.md.
    })
})
