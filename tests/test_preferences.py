"""RUN_SHEET section 10: the preferences panel."""

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.locators import PREFERENCES_ICON, icon_button

AUTOOPEN_LABEL = "Automatically Open Tools in a New Tab After Launch"
# Vuetify's v-switch renders a plain checkbox input without role="switch", so the control
# has to be reached through the component's own class.
AUTOOPEN_SWITCH = ".v-switch input[type=checkbox]"


def test_10_1_shows_the_autoopen_switch(dashboard: Dashboard) -> None:
    """10.1 Preferences offers a single auto-open switch with a popup caption."""
    page = dashboard.open("")

    icon_button(page, PREFERENCES_ICON).click()

    expect(page.get_by_text(AUTOOPEN_LABEL)).to_be_visible()
    expect(page.get_by_text("allow pop-ups", exact=False)).to_be_visible()
    expect(page.locator(AUTOOPEN_SWITCH)).to_have_count(1)


def test_10_2_autoopen_persists_across_a_reload(dashboard: Dashboard) -> None:
    """10.2 The switch is stored in localStorage under "autoopen" and survives a reload."""
    page = dashboard.open("")

    icon_button(page, PREFERENCES_ICON).click()
    page.locator(AUTOOPEN_SWITCH).check()

    assert page.evaluate("window.localStorage.getItem('autoopen')") == "true"

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".v-footer")
    icon_button(page, PREFERENCES_ICON).click()

    expect(page.locator(AUTOOPEN_SWITCH)).to_be_checked()


def test_10_3_preferences_hidden_when_logged_out(dashboard: Dashboard) -> None:
    """10.3 The Preferences icon is absent entirely when logged out."""
    page = dashboard.open("", logged_in=False)

    expect(icon_button(page, PREFERENCES_ICON)).to_have_count(0)
