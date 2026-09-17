/**
 * Shared locator helpers.
 *
 * Navigation note: baseURL is `http://localhost:5173${VITE_BASE_PATH}` (e.g.
 * ".../nova/", see playwright.config.js). Per the WHATWG URL spec, a leading "/" in
 * page.goto() replaces the ENTIRE path of a relative reference, discarding the base's
 * "/nova/" prefix - so specs must goto() paths *without* a leading slash (e.g. "imaging",
 * not "/imaging"; "" for home, not "/").
 */
import { expect } from "./fixtures"

/** Locates a Vuetify icon-only <v-btn> by the icon's mdi-* class (these buttons render
 * with no accessible text, so getByRole(...) can't target them by name). */
export function iconButton(page, iconClass) {
    return page.locator(`button:has(i.${iconClass})`)
}

/**
 * Locates a single ToolListItem row (a v-list-item) by its tool name.
 *
 * Uses a word-boundary regex rather than plain substring `hasText` matching: a bare
 * substring match on e.g. "Reduce" also matches the *Visualize* row, whose own subtitle
 * ("Visualizes reduced data.") contains "reduce" as a substring of "reduced".
 */
export function toolRow(page, toolName) {
    const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    return page.locator(".v-list-item", { hasText: new RegExp(`\\b${escaped}\\b`) })
}

/**
 * ToolListItem briefly renders a disabled "Checking login status" button before the first
 * job-monitor poll resolves (has_monitored flips from false to true), then swaps in the
 * real Start/Open/Stop buttons once that resolves. Callers that click Start/Open/Stop right
 * after navigating should await this first so they don't race that transition.
 */
export async function waitForRowSettled(row) {
    await expect(row.getByRole("button", { name: "Checking login status" })).toHaveCount(0)
}
