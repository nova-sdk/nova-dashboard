"""RUN_SHEET section 12: the floating generic-tools drawer."""

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.locators import TOOLS_FAB_ICON, icon_button, tool_row
from tests.support.tools import panel_without_generic_tools


def test_12_1_fab_visible_when_generic_tools_exist(dashboard: Dashboard) -> None:
    """12.1 The Tools FAB appears whenever generic or prototype tools are configured."""
    page = dashboard.open("")

    expect(icon_button(page, TOOLS_FAB_ICON)).to_be_visible()


def test_12_2_fab_absent_without_generic_tools(dashboard: Dashboard) -> None:
    """12.2 With no generic or prototype tools the FAB is not rendered at all."""
    page = dashboard.open("", panel=panel_without_generic_tools())

    expect(icon_button(page, TOOLS_FAB_ICON)).to_have_count(0)


def test_12_3_fab_opens_a_drawer_with_both_sections(dashboard: Dashboard) -> None:
    """12.3 The drawer lists General and Prototype tools with working tool rows."""
    page = dashboard.open("")

    icon_button(page, TOOLS_FAB_ICON).click()

    drawer = page.locator(".v-navigation-drawer")
    expect(drawer).to_be_visible()
    expect(drawer.get_by_text("General Tools")).to_be_visible()
    expect(drawer.get_by_text("Prototype Tools")).to_be_visible()

    expect(tool_row(page, "Notebook").first).to_be_visible()
    expect(tool_row(page, "Prototype Shell").first).to_be_visible()
    expect(tool_row(page, "Notebook").first.get_by_role("button", name="Start")).to_be_visible()
