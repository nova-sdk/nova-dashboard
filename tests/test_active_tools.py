"""RUN_SHEET section 6: the Active Tools panel and externally-launched tools.

``App.vue`` only lists a tool here once its job reports ``url_ready``, so each test seeds
a job that is both running and ready.
"""

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.locators import ACTIVE_TOOLS_ICON, icon_button, tool_row

TOOL = "Reconstruct"
TOOL_ID = "nova_reconstruct"


def test_6_1_badge_counts_running_tools(dashboard: Dashboard) -> None:
    """6.1 The header badge reports how many tools are running."""
    dashboard.jobs.seed_external(TOOL_ID)
    page = dashboard.open("")
    dashboard.advance_job_poll(2)

    expect(icon_button(page, ACTIVE_TOOLS_ICON)).to_be_visible()
    expect(page.locator(".v-badge__badge")).to_have_text("1")


def test_6_2_badge_hidden_without_running_tools(dashboard: Dashboard) -> None:
    """6.2 With nothing running the Active Tools button is hidden."""
    page = dashboard.open("")
    dashboard.advance_job_poll(2)

    expect(icon_button(page, ACTIVE_TOOLS_ICON)).to_be_hidden()


def test_6_3_panel_lists_each_running_tool(dashboard: Dashboard) -> None:
    """6.3 The panel lists running tools using the same row layout as a category page."""
    dashboard.jobs.seed_external(TOOL_ID)
    page = dashboard.open("")
    dashboard.advance_job_poll(2)

    icon_button(page, ACTIVE_TOOLS_ICON).click()

    panel_row = tool_row(page, TOOL)
    expect(panel_row.first).to_be_visible()
    expect(page.get_by_role("link", name="Open").first).to_be_visible()


def test_6_4_externally_launched_tool_is_labeled_and_controllable(dashboard: Dashboard) -> None:
    """6.4 A job launched outside the dashboard is labeled as such, with Open and Stop."""
    dashboard.jobs.seed_external(TOOL_ID)
    page = dashboard.open("")
    dashboard.advance_job_poll(2)

    icon_button(page, ACTIVE_TOOLS_ICON).click()

    expect(page.get_by_text("Launched outside of dashboard.").first).to_be_visible()
    expect(page.get_by_role("link", name="Open").first).to_be_visible()
    expect(page.get_by_role("button", name="Stop").first).to_be_visible()


def test_6_5_datafile_tool_shows_its_parameters(dashboard: Dashboard) -> None:
    """6.5 A datafile-triggered job lists the parameters it was auto-launched with."""
    dashboard.jobs.seed_datafile(TOOL_ID, {"param": "value"})
    page = dashboard.open("")
    dashboard.advance_job_poll(2)

    icon_button(page, ACTIVE_TOOLS_ICON).click()

    expect(page.get_by_text("Autolaunched with parameters: param: value").first).to_be_visible()
