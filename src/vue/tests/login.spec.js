import { advanceJobPoll, expect, test } from "./fixtures"
import { iconButton } from "./helpers"

test.describe("1. Login / Logout / Session", () => {
    test("1.1 logged out: header shows Login, no account/preferences/active-tools UI", async ({
        loggedOutPage: page
    }) => {
        await page.goto("imaging")

        await expect(page.getByRole("link", { name: "Login" })).toBeVisible()
        await expect(iconButton(page, "mdi-cogs")).toHaveCount(0) // Preferences
        await expect(iconButton(page, "mdi-account-circle")).toHaveCount(0)
    })

    test("1.2 login from home redirects back to the home page after auth", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await expect(page.getByRole("link", { name: "Login" })).toHaveAttribute(
            "href",
            "http://galaxy.invalid/login/start?redirect=/"
        )
    })

    test("1.3 login from a category page redirects back to that same category", async ({
        loggedOutPage: page
    }) => {
        await page.goto("imaging")

        await expect(page.getByRole("link", { name: "Login" })).toHaveAttribute(
            "href",
            "http://galaxy.invalid/login/start?redirect=/imaging"
        )
    })

    test("1.4 logged in: account menu shows the current user's email", async ({
        loggedInPage: page
    }) => {
        await page.goto("")

        await iconButton(page, "mdi-account-circle").click()
        await expect(page.getByText("Logged in as scientist@ornl.gov")).toBeVisible()
    })

    test("1.5 logout link points at Galaxy's user page via the Galaxy alias", async ({
        loggedInPage: page
    }) => {
        await page.goto("")

        await iconButton(page, "mdi-account-circle").click()
        await expect(page.getByRole("link", { name: "Logout via NDIP" })).toHaveAttribute(
            "href",
            "/user"
        )
    })

    test("1.6 a mismatched user id detected mid-session forces a reload", async ({
        loggedInPage: page
    }) => {
        await page.goto("imaging") // CategoryView calls job.startMonitor(), which polls
        await expect(page.getByText("Imaging Applications")).toBeVisible()

        // Simulate the underlying Galaxy session switching to a different user. Every
        // monitor poll re-checks /api/whoami via job.js's galaxyFetch() -> user.getUserId(),
        // which reloads the page when the previously-seen id no longer matches (user.js:72-74).
        await page.route("**/api/whoami", async (route) => {
            await route.fulfill({ json: { id: "99", email: "other-scientist@ornl.gov" } })
        })

        const reloaded = page.waitForEvent("load")
        await advanceJobPoll(page)
        await reloaded
    })
})
