import { advanceStatusPoll, expect, test } from "./fixtures"
import { toolRow, waitForRowSettled } from "./helpers"
import {
    computeNodeAlert,
    instrumentMountAlert,
    mockStatus,
    mockStatusUnavailable
} from "./mocks/status"

function statusBanner(page) {
    return page.locator(".v-banner.cursor-pointer")
}

test.describe("7. System Status Banner (Compute / Instrument Mount Alerts)", () => {
    test("7.1 with no active alerts, the banner reads 'operating normally'", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")

        await expect(page.getByText("All NDIP systems are operating normally.")).toBeVisible()
    })

    test("7.2 a warning-severity alert turns the banner to a degraded-performance warning", async ({
        loggedInPage: page
    }) => {
        await mockStatus(page, { alerts: [computeNodeAlert("sns-analysis1", "warning")] })
        await page.goto("imaging")

        await expect(
            page.getByText(
                "Some NDIP systems are experiencing degraded performance. Hover for details."
            )
        ).toBeVisible()
    })

    test("7.3 a critical-severity alert turns the banner to an outage error", async ({
        loggedInPage: page
    }) => {
        await mockStatus(page, { alerts: [computeNodeAlert("sns-analysis1", "critical")] })
        await page.goto("imaging")

        await expect(
            page.getByText("Some NDIP systems are experiencing outages. Hover for details.")
        ).toBeVisible()
    })

    test("7.4 an unreachable monitoring endpoint shows an 'unavailable' banner", async ({
        loggedInPage: page
    }) => {
        await mockStatusUnavailable(page)
        await page.goto("imaging")

        await expect(page.getByText("Unable to check NDIP status.")).toBeVisible()
        // NOTE: RUN_SHEET.md describes this state as suppressing the banner entirely, but
        // StatusPanel.vue always renders the v-banner activator regardless of status - only
        // the hover card is conditional on showBanner. This asserts the code's actual
        // behavior; see tests/RUN_SHEET.md for this discrepancy.
        await expect(page.getByText("NDIP System Status")).toHaveCount(0)
    })

    test("7.5 hovering the banner shows the System Status card with all six service groups", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")

        await statusBanner(page).hover()

        await expect(page.getByText("NDIP System Status")).toBeVisible()
        await expect(page.getByText("Infrastructure", { exact: true })).toBeVisible()
        await expect(page.getByText("ONCat", { exact: true })).toBeVisible()
        await expect(page.getByText("Live Data", { exact: true })).toBeVisible()
        await expect(page.getByText("Documentation", { exact: true })).toBeVisible()
        await expect(page.getByText(/^Compute Resources/)).toBeVisible()
        await expect(page.getByText(/^Instrument Data/)).toBeVisible()
    })

    test.fixme("7.6 with MONITORING_URL configured, the hover card shows a 'View Monitoring Details' button", async () => {
        // NOT CURRENTLY IMPLEMENTED: Django's MONITORING_URL setting (settings.py) is never
        // included in any API response, and AlertManager (assets/js/alerts.js) never sets
        // `monitoringUrl` on itself, so StatusPanel.vue's `v-if="alertManager.monitoringUrl"`
        // is always false - this button cannot currently appear no matter what the backend
        // is configured with. Flagging as a real product gap rather than a user interface suite limitation.
    })

    test.fixme("7.7 with MONITORING_URL not configured, the hover card has no such button", async () => {
        // See 7.6 - always true today, but for the wrong reason (the field is never wired
        // up at all). Left fixme alongside 7.6 pending a product fix.
    })

    test("7.8 expanding Compute Resources shows a per-compute-node breakdown with a count", async ({
        loggedInPage: page
    }) => {
        await mockStatus(page, { alerts: [computeNodeAlert("sns-analysis1", "critical")] })
        await page.goto("imaging")
        await statusBanner(page).hover()

        await expect(page.getByText(/^Compute Resources \(1 of 2 up\)$/)).toBeVisible()

        await page.getByText(/^Compute Resources/).click()

        await expect(page.getByText("sns-analysis1", { exact: true })).toBeVisible()
        await expect(page.getByText("hfir-analysis1", { exact: true })).toBeVisible()
    })

    test("7.9 expanding Instrument Data drills down to per-node instrument mount status", async ({
        loggedInPage: page
    }) => {
        await mockStatus(page, {
            alerts: [instrumentMountAlert("sns-analysis1", "SNS-CORELLI", "warning")]
        })
        await page.goto("imaging")
        await statusBanner(page).hover()

        await page.getByText(/^Instrument Data/).click()
        // The Compute Resources group also has a bare "sns-analysis1" leaf with no count -
        // match the Instrument Data one specifically, which has a "(N of 42 up)" count.
        await page.getByText(/^sns-analysis1 \(/).click()

        // Every compute node gets the full ~40-mount instrument list as children (see
        // getInstrumentAlerts in alerts.js), so hfir-analysis1's own (unaffected)
        // SNS-CORELLI row is also on the page - distinguish sns-analysis1's by its warning
        // icon, rather than trying to scope to one v-list-group among an unlabeled pair.
        const warningCorelli = page
            .locator(".v-list-item", { hasText: "SNS-CORELLI" })
            .filter({ has: page.locator("i.text-warning") })
        await expect(warningCorelli).toBeVisible()
    })

    test("7.10 regression: nested counts update live without closing/reopening the card", async ({
        loggedInPage: page
    }) => {
        await mockStatus(page, { alerts: [computeNodeAlert("sns-analysis1", "critical")] })
        await page.goto("imaging")
        await statusBanner(page).hover()

        await expect(page.getByText(/^Compute Resources \(1 of 2 up\)$/)).toBeVisible()

        // The node comes back up - re-mock without closing the still-open hover card.
        await mockStatus(page, { alerts: [] })
        await advanceStatusPoll(page)

        await expect(page.getByText(/^Compute Resources \(2 of 2 up\)$/)).toBeVisible()
    })

    test("7.11 the slow-launch warning tooltip references checking the status banner", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging")
        const row = toolRow(page, "Reduce")
        await waitForRowSettled(row)

        await row.getByRole("button", { name: "Start" }).click()
        await page.clock.runFor(10200)

        await row.locator("i.mdi-information-outline").hover()
        await expect(
            page.getByText(/system status banner at the top of the page shows errors/)
        ).toBeVisible()
    })
})
