import { expect, test } from "./fixtures"

test.describe("3. Category Page", () => {
    test("3.1 a category with tools renders a '{Category} Tools' list with launch buttons", async ({
        loggedOutPage: page
    }) => {
        await page.goto("imaging")

        await expect(page.getByText("Imaging Applications")).toBeVisible()
        await expect(page.getByText("Imaging Tools", { exact: true })).toBeVisible()
        // Word-boundary match: a bare "Reduce" substring also matches Visualize's own
        // subtitle ("Visualizes reduced data.").
        await expect(page.getByText(/\bReduce\b/)).toBeVisible()
    })

    test("3.2 a category with no non-prototype tools shows the 'stay tuned' message", async ({
        loggedOutPage: page
    }) => {
        await page.goto("scattering")

        await expect(
            page.getByText("Stay tuned, we will be adding technique-specific tools here soon!")
        ).toBeVisible()
    })

    test("3.3 a category with prototype tools shows a separate Prototype Tools section", async ({
        loggedOutPage: page
    }) => {
        await page.goto("scattering")

        await expect(page.getByText("Prototype Tools", { exact: true })).toBeVisible()
        await expect(page.getByText("Prototype Scatter")).toBeVisible()
    })

    test("3.4 an unknown category slug redirects to the 404 view", async ({
        loggedOutPage: page
    }) => {
        await page.goto("not-a-real-category")

        await expect(page.getByText("The content you requested could not be found.")).toBeVisible()
    })
})
