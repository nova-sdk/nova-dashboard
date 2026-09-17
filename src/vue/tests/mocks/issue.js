/**
 * Mocks POST /api/issue/ (BugPanel.vue), matching IssueManager.submit()'s response shape
 * (src/launcher_app/issue.py) on success, and Django's HttpResponseBadRequest on failure.
 */
export async function mockIssueSuccess(
    page,
    url = "https://code.ornl.gov/ndip/nova-dashboard/-/issues/123"
) {
    await page.route("**/api/issue/", async (route) => {
        await route.fulfill({ json: { url } })
    })
}

export async function mockIssueFailure(page) {
    await page.route("**/api/issue/", async (route) => {
        await route.fulfill({ status: 400, body: "unable to process request" })
    })
}
