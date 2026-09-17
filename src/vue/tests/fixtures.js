/**
 * Shared Playwright fixtures for the NOVA Dashboard user interface suite. Every backend call the SPA
 * makes is mocked at the browser network layer (see ./mocks) - no Django/Galaxy/Prometheus/
 * GitLab is required. See the "Testing" section of the root README.md and tests/RUN_SHEET.md.
 */
import { test as base, expect } from "@playwright/test"

import { mockVuetifyConfig } from "./mocks/vuetifyConfig"
import { defaultTools, mockTools } from "./mocks/tools"
import { mockLoggedIn, mockLoggedOut } from "./mocks/auth"
import { mockStatus } from "./mocks/status"
import { mockNotification } from "./mocks/notification"
import { createJobController, mockJobs } from "./mocks/jobs"

async function mockCommon(page, tools, notificationState) {
    // Installed before any navigation so every setTimeout/setInterval the app schedules
    // (job polling, status polling, snackbar/slow-launch timers, ...) can be fast-forwarded
    // with page.clock instead of waiting on real wall-clock time.
    await page.clock.install()

    await mockVuetifyConfig(page)
    await mockTools(page, tools)
    await mockStatus(page)
    await mockNotification(page, notificationState)
}

export const test = base.extend({
    // Override per-test/describe with test.use({ tools: {...} }) - see mocks/tools.js.
    // eslint-disable-next-line no-empty-pattern
    tools: [({}, use) => use(defaultTools()), { option: true }],

    // eslint-disable-next-line no-empty-pattern
    jobController: async ({}, use) => {
        await use(createJobController())
    },

    // Mutable { display, message } backing GET/POST /api/notification/ - kept as its own
    // fixture (rather than hidden inside mockCommon) so tests can assert on it directly
    // after a NotificationPanel Save, without needing a second mocked page to poll GET.
    // eslint-disable-next-line no-empty-pattern
    notificationState: async ({}, use) => {
        await use({ display: false, message: "" })
    },

    // A page with a logged-out user - GET /api/whoami resolves to null.
    loggedOutPage: async ({ page, tools, notificationState }, use) => {
        await mockCommon(page, tools, notificationState)
        await mockLoggedOut(page)
        await use(page)
    },

    // A page with a logged-in, non-admin user, wired up for the full tool launch/stop
    // lifecycle via jobController.
    loggedInPage: async ({ page, tools, jobController, notificationState }, use) => {
        await mockCommon(page, tools, notificationState)
        await mockLoggedIn(page)
        await mockJobs(page, jobController)
        await use(page)
    },

    // Same as loggedInPage, but the mocked user is a Galaxy admin (notification bell visible).
    adminPage: async ({ page, tools, jobController, notificationState }, use) => {
        await mockCommon(page, tools, notificationState)
        await mockLoggedIn(page, { isAdmin: true })
        await mockJobs(page, jobController)
        await use(page)
    }
})

export { expect }

/** Advances virtual time past one job-monitor poll interval (job.js: `timeout: 2000`). */
export async function advanceJobPoll(page, ms = 2100) {
    await page.clock.runFor(ms)
}

/** Advances virtual time past one status-banner poll interval (StatusPanel.vue: 5000ms). */
export async function advanceStatusPoll(page, ms = 5100) {
    await page.clock.runFor(ms)
}
