import { expect, test } from "./fixtures"

test.describe("13. 404 / Not Found", () => {
    test("13.1 an arbitrary unmatched path shows the NotFoundView", async ({
        loggedOutPage: page
    }) => {
        await page.goto("this/does/not/exist")

        await expect(page.getByText("The content you requested could not be found.")).toBeVisible()
        await expect(page.getByRole("link", { name: "Home" })).toBeVisible()
    })
})
