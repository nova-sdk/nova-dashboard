/**
 * Mocks GET/POST /api/notification/ (src/vue/src/stores/notification.js), polled every 60s
 * by NotificationPanel.vue and read once by App.vue's admin banner. Stateful in-memory so a
 * POST from the admin panel is reflected on the next GET, matching NotificationManager
 * (src/launcher_app/notification.py).
 *
 * `state` is a plain mutable object rather than a closure variable so callers (e.g.
 * fixtures.js's `notificationState`) can keep a reference and assert on it directly after a
 * POST, without needing a second mocked page to poll GET.
 */
export async function mockNotification(page, state = { display: false, message: "" }) {
    await page.route("**/api/notification/", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill({ json: state })
            return
        }

        const body = route.request().postDataJSON()
        state.display = body.display
        state.message = body.message
        await route.fulfill({ status: 200, body: "" })
    })

    return state
}
