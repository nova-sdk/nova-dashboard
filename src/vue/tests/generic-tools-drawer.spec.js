import { expect, test } from "./fixtures"
import { defaultTools } from "./mocks/tools"

function fabButton(page) {
    return page.locator("button:has(i.mdi-tools)")
}

test.describe("12. Generic Tools Drawer", () => {
    test("12.1 the Tools FAB is visible when generic/prototype tools exist", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await expect(fabButton(page)).toBeVisible()
    })

    test("12.2 the Tools FAB is absent when no generic/prototype tools exist", async ({
        loggedOutPage: page
    }) => {
        const tools = defaultTools()
        delete tools["generic-tools"]
        await page.route("**/api/galaxy/tools/", async (route) => {
            await route.fulfill({ json: { tools } })
        })

        await page.goto("")

        await expect(fabButton(page)).toHaveCount(0)
    })

    test("12.3 clicking the FAB opens a drawer with General and Prototype Tools sections", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")

        await fabButton(page).click()

        const drawer = page.locator(".v-navigation-drawer")
        await expect(drawer.getByText("General Tools")).toBeVisible()
        await expect(drawer.getByText("Generic Tool", { exact: false })).toBeVisible()
        await expect(drawer.getByText("Prototype Tools")).toBeVisible()
        await expect(drawer.getByText("Generic Prototype")).toBeVisible()
    })
})
