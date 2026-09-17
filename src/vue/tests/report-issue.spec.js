import { expect, test } from "./fixtures"
import { mockIssueFailure, mockIssueSuccess } from "./mocks/issue"

async function openBugPanel(page) {
    await page.getByRole("button", { name: "Report Issue" }).click()
}

async function fillValidIssue(page) {
    await page.getByLabel("Topic").click()
    await page.getByRole("option", { name: "Login Issue" }).click()
    await page.getByLabel("Please Describe Your Issue").fill("Cannot log in.")
}

test.describe("9. Report Issue Form", () => {
    test("9.1 logged out: shows a static support-email message with no form", async ({
        loggedOutPage: page
    }) => {
        await page.goto("")
        await openBugPanel(page)

        await expect(page.getByRole("link", { name: "ndip-support@ornl.gov" })).toBeVisible()
        await expect(page.getByLabel("Topic")).toHaveCount(0)
    })

    test("9.2 logged in: shows the form with a pre-filled, disabled Email field", async ({
        loggedInPage: page
    }) => {
        await page.goto("")
        await openBugPanel(page)

        const email = page.getByLabel("Email Address")
        await expect(email).toHaveValue("scientist@ornl.gov")
        await expect(email).toBeDisabled()
        await expect(page.getByLabel("Topic")).toBeVisible()
        await expect(page.getByLabel("Please Describe Your Issue")).toBeVisible()
    })

    test("9.3 Submit stays disabled until Topic and Description are both filled", async ({
        loggedInPage: page
    }) => {
        await page.goto("")
        await openBugPanel(page)

        await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled()

        await page.getByLabel("Topic").click()
        await page.getByRole("option", { name: "Login Issue" }).click()
        await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled()

        await page.getByLabel("Please Describe Your Issue").fill("Cannot log in.")
        await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled()
    })

    test("9.4 Topic lists every category/tool plus a General Issues group", async ({
        loggedInPage: page
    }) => {
        await page.goto("")
        await openBugPanel(page)
        await page.getByLabel("Topic").click()

        await expect(page.getByText("General Issues", { exact: true })).toBeVisible()
        await expect(page.getByRole("option", { name: "Login Issue" })).toBeVisible()
        await expect(page.getByRole("option", { name: "Problem Starting Tools" })).toBeVisible()
        await expect(page.getByRole("option", { name: "Other" })).toBeVisible()
        await expect(
            page.getByRole("listbox", { name: "Topic" }).getByText("Imaging", { exact: true })
        ).toBeVisible()
        await expect(page.getByRole("option", { name: "Reduce" })).toBeVisible()
    })

    test("9.5 submitting shows a progress spinner during the ~1s delay", async ({
        loggedInPage: page
    }) => {
        await mockIssueSuccess(page)
        await page.goto("")
        await openBugPanel(page)
        await fillValidIssue(page)

        await page.getByRole("button", { name: "Submit", exact: true }).click()
        // Scoped to the issue card - the footer also has its own (always-present) progress
        // circular.
        const issueCard = page.locator(".v-card", { hasText: "Please Describe Your Issue" })
        await expect(issueCard.getByRole("progressbar")).toBeVisible()

        await page.clock.runFor(1100)
    })

    test("9.6 a successful submission shows the issue link and resets the form", async ({
        loggedInPage: page
    }) => {
        await mockIssueSuccess(page, "https://code.ornl.gov/ndip/nova-dashboard/-/issues/123")
        await page.goto("")
        await openBugPanel(page)
        await fillValidIssue(page)

        await page.getByRole("button", { name: "Submit", exact: true }).click()
        await page.clock.runFor(1100)

        await expect(page.getByText(/Issue was opened successfully/)).toBeVisible()
        await expect(
            page.getByRole("link", {
                name: "https://code.ornl.gov/ndip/nova-dashboard/-/issues/123"
            })
        ).toBeVisible()
        await expect(page.getByLabel("Please Describe Your Issue")).toHaveValue("")
    })

    test("9.7 a failed submission shows a generic error and resets the form", async ({
        loggedInPage: page
    }) => {
        await mockIssueFailure(page)
        await page.goto("")
        await openBugPanel(page)
        await fillValidIssue(page)

        await page.getByRole("button", { name: "Submit", exact: true }).click()
        await page.clock.runFor(1100)

        await expect(
            page.getByText("Something went wrong while submitting your issue. Please try again.")
        ).toBeVisible()
        await expect(page.getByLabel("Please Describe Your Issue")).toHaveValue("")
    })

    test("9.8 the description field is capped at 500 characters", async ({
        loggedInPage: page
    }) => {
        await page.goto("")
        await openBugPanel(page)

        await page.getByLabel("Please Describe Your Issue").fill("a".repeat(600))

        await expect(page.getByLabel("Please Describe Your Issue")).toHaveValue("a".repeat(500))
    })
})
