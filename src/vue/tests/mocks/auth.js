/**
 * Mocks the user's login state.
 *
 * There is no Django /api/whoami or /api/users/:id/api_key route in this repo - in
 * production those are served by external NDIP/Calvera infrastructure sitting in front of
 * the app (see src/vue/src/stores/user.js). We intentionally leave VITE_MOCK_USER_EMAIL/
 * VITE_MOCK_USER_API_KEY unset for the user interface suite (see .env.user-interface) so that both the logged-in
 * and logged-out code paths are actually exercised, and mock these two endpoints directly
 * at the browser network layer instead.
 */

export const DEFAULT_USER = { id: "42", email: "scientist@ornl.gov" }
export const DEFAULT_API_KEY = "test-api-key-123"

export async function mockLoggedOut(page) {
    await page.route("**/api/whoami", async (route) => {
        await route.fulfill({ json: null })
    })
}

export async function mockLoggedIn(
    page,
    { user = DEFAULT_USER, apiKey = DEFAULT_API_KEY, isAdmin = false } = {}
) {
    await page.route("**/api/whoami", async (route) => {
        await route.fulfill({ json: user })
    })
    await page.route(`**/api/users/${user.id}/api_key`, async (route) => {
        await route.fulfill({ contentType: "text/plain", body: `"${apiKey}"` })
    })
    await mockIsAdmin(page, isAdmin)
}

export async function mockIsAdmin(page, isAdmin) {
    await page.route("**/api/galaxy/is_admin/", async (route) => {
        await route.fulfill({ json: { is_admin: isAdmin } })
    })
}
