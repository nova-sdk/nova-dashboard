import { expect, test } from "./fixtures"
import { iconButton } from "./helpers"

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 400, height: 800 }

test.describe("11. Header / Menus - Desktop vs Mobile", () => {
    test("11.1 a wide viewport shows the full desktop app bar with individual icons", async ({
        adminPage: page
    }) => {
        await page.setViewportSize(DESKTOP)
        await page.goto("")

        await expect(page.getByAltText("NOVA Logo")).toBeVisible()
        await expect(iconButton(page, "mdi-bell")).toBeVisible() // admin notification bell
        await expect(page.getByRole("link", { name: "Galaxy Square Logo" })).toBeVisible()
        await expect(page.getByRole("button", { name: /Citing NDIP\/NOVA/ })).toBeVisible()
        await expect(page.getByRole("button", { name: "Report Issue" })).toBeVisible()
        await expect(iconButton(page, "mdi-help")).toBeVisible()
        await expect(iconButton(page, "mdi-cogs")).toBeVisible() // Preferences
        await expect(iconButton(page, "mdi-account-circle")).toBeVisible()
        await expect(iconButton(page, "mdi-menu")).toHaveCount(0) // no hamburger on desktop
    })

    test("11.2 a narrow viewport collapses into a hamburger menu, with no notification bell at all", async ({
        adminPage: page
    }) => {
        await page.setViewportSize(MOBILE)
        await page.goto("")

        const hamburger = iconButton(page, "mdi-menu")
        await expect(hamburger).toBeVisible()
        await hamburger.click()

        await expect(page.getByText("Logged in as scientist@ornl.gov")).toBeVisible()
        // MobileLayout.vue does not render NotificationPanel at all (unlike Desktop, which
        // just visually hides it for non-admins via v-show) - the bell is absent outright.
        await expect(iconButton(page, "mdi-bell")).toHaveCount(0)
    })

    test("11.3 clicking the logo navigates Home from any page", async ({ loggedOutPage: page }) => {
        await page.goto("imaging")

        await page.getByAltText("NOVA Logo").click()

        await expect(page.getByText("Welcome to the NOVA Dashboard")).toBeVisible()
    })

    test("11.4 the Galaxy icon links out to the Galaxy instance, with an alias tooltip", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        const galaxyLink = page.getByRole("link", { name: "Galaxy Square Logo" })
        await expect(galaxyLink).toHaveAttribute("href", "http://galaxy.invalid")
        await expect(galaxyLink).toHaveAttribute("target", "_blank")

        await galaxyLink.hover()
        await expect(page.getByText("NDIP", { exact: true })).toBeVisible()
    })

    test("11.5 the Citation panel shows static citation text and DOI links", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await page.getByRole("button", { name: /Citing NDIP\/NOVA/ }).click()

        await expect(page.getByText("Please do not forget to cite NDIP")).toBeVisible()
        await expect(page.getByRole("link", { name: /Calvera: A Platform/ })).toHaveAttribute(
            "href",
            "https://doi.org/10.1093/nar/gkae410"
        )
    })

    test("11.6 the Help panel shows version, changelog link, description, and doc links", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await iconButton(page, "mdi-help").click()

        await expect(page.getByText(/The dashboard is currently running version/)).toBeVisible()
        await expect(page.getByRole("link", { name: "View Changelog" })).toHaveAttribute(
            "href",
            "http://nova.invalid/changelog"
        )
        await expect(
            page.getByText("Neutrons Open Visualization and Analysis Framework")
        ).toBeVisible()
        await expect(page.getByRole("link", { name: "NOVA Documentation" })).toHaveAttribute(
            "href",
            "http://nova.invalid/docs"
        )
        await expect(page.getByRole("link", { name: "NOVA Tutorial" })).toHaveAttribute(
            "href",
            "http://nova.invalid/tutorial"
        )
        await expect(page.getByRole("link", { name: "Admin Guide" })).toHaveAttribute(
            "href",
            "http://galaxy.invalid/docs"
        )
        await expect(page.getByText(/Laboratory Directed Research and Development/)).toBeVisible()
    })
})
