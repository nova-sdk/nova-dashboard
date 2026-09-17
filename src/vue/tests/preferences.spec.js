import { expect, test } from "./fixtures"
import { iconButton } from "./helpers"

test.describe("10. Preferences Panel", () => {
    test("10.1 shows a single auto-open switch with a popup caption", async ({
        loggedInPage: page
    }) => {
        await page.goto("")
        await iconButton(page, "mdi-cogs").click()

        await expect(
            page.getByLabel("Automatically Open Tools in a New Tab After Launch")
        ).toBeVisible()
        await expect(page.getByText(/allow pop-ups on this site/)).toBeVisible()
    })

    test("10.2 toggling the switch persists across a reload via localStorage", async ({
        loggedInPage: page
    }) => {
        await page.goto("")
        await iconButton(page, "mdi-cogs").click()
        await page.getByLabel("Automatically Open Tools in a New Tab After Launch").click()

        await expect
            .poll(() => page.evaluate(() => window.localStorage.getItem("autoopen")))
            .toBe("true")

        await page.reload()
        await iconButton(page, "mdi-cogs").click()
        await expect(
            page.getByLabel("Automatically Open Tools in a New Tab After Launch")
        ).toBeChecked()
    })

    test("10.3 the Preferences icon is not visible when logged out", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await expect(iconButton(page, "mdi-cogs")).toHaveCount(0)
    })
})
