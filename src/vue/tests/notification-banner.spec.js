import { expect, test } from "./fixtures"
import { iconButton } from "./helpers"

test.describe("8. System Notification Banner (Admin Message)", () => {
    test("8.1 non-admin: no bell icon, but an admin-enabled banner still shows", async ({
        loggedInPage: page,
        notificationState
    }) => {
        notificationState.display = true
        notificationState.message = "Scheduled maintenance tonight."

        await page.goto("")

        // Hidden via v-show (DesktopLayout.vue), not v-if, so it's still present in the DOM.
        await expect(iconButton(page, "mdi-bell")).not.toBeVisible()
        await expect(page.getByText("Scheduled maintenance tonight.")).toBeVisible()
    })

    test("8.2 admin: the notification bell icon is visible", async ({ adminPage: page }) => {
        await page.goto("")

        await expect(iconButton(page, "mdi-bell")).toBeVisible()
    })

    test("8.3 admin sets and saves a notification, which becomes visible", async ({
        adminPage: page,
        notificationState
    }) => {
        await page.goto("")

        await iconButton(page, "mdi-bell").click()
        await page.getByLabel("Display?").click()
        await page.getByLabel("Change Notification").fill("Scheduled maintenance tonight.")
        await page.getByRole("button", { name: "Save", exact: true }).click()

        await expect(page.getByText("Scheduled maintenance tonight.")).toBeVisible()
        // Confirms the POST actually persisted server-side (so another session's next
        // 60s poll would pick it up too), not just the panel's own local v-model state.
        await expect.poll(() => notificationState.display).toBe(true)
        expect(notificationState.message).toBe("Scheduled maintenance tonight.")
    })

    test("8.4 disabling Display and saving hides the banner", async ({
        adminPage: page,
        notificationState
    }) => {
        notificationState.display = true
        notificationState.message = "Scheduled maintenance tonight."

        await page.goto("")
        await expect(page.getByText("Scheduled maintenance tonight.")).toBeVisible()

        await iconButton(page, "mdi-bell").click()
        await page.getByLabel("Display?").click()
        await page.getByRole("button", { name: "Save", exact: true }).click()

        await expect(page.getByText("Scheduled maintenance tonight.")).not.toBeVisible()
        await expect.poll(() => notificationState.display).toBe(false)
    })
})
