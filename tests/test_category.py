"""RUN_SHEET section 3: the per-category tool list."""

import re

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.locators import tool_row
from tests.support.tools import panel_with_empty_category


def test_3_1_category_lists_its_tools_with_launch_buttons(dashboard: Dashboard) -> None:
    """3.1 A category renders its tools under a "{Category} Tools" heading."""
    page = dashboard.open("imaging")

    expect(page.get_by_text("Imaging Applications")).to_be_visible()
    expect(page.get_by_text("Imaging Tools")).to_be_visible()

    row = tool_row(page, "Reconstruct")
    expect(row).to_be_visible()
    expect(row).to_contain_text("Reconstructs raw projections.")
    expect(row.get_by_role("button", name="Start")).to_be_visible()


def test_3_2_category_without_tools_shows_stay_tuned(dashboard: Dashboard) -> None:
    """3.2 A category with no non-prototype tools shows the "stay tuned" message."""
    page = dashboard.open("imaging", panel=panel_with_empty_category())

    expect(page.get_by_text("Stay tuned, we will be adding technique-specific tools here soon!")).to_be_visible()


def test_3_3_prototype_tools_render_in_their_own_section(dashboard: Dashboard) -> None:
    """3.3 A category's prototype tools appear under a separate Prototype Tools heading."""
    page = dashboard.open("spectroscopy")

    expect(page.get_by_text("Prototype Tools")).to_be_visible()
    expect(tool_row(page, "Prototype Fitter")).to_be_visible()


def test_3_4_unknown_category_redirects_to_not_found(dashboard: Dashboard) -> None:
    """3.4 A category slug that matches no category redirects to the 404 view."""
    page = dashboard.open("not-a-real-category")

    expect(page.get_by_text("The content you requested could not be found.")).to_be_visible()
    # CategoryView redirects with router.replace to the catch-all route, which rewrites
    # the URL rather than keeping the bad slug in the address bar.
    expect(page).not_to_have_url(re.compile(r"not-a-real-category"))
