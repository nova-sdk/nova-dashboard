"""RUN_SHEET section 11: the header, in both its desktop and mobile layouts.

``App.vue`` swaps ``DesktopLayout`` for ``MobileLayout`` on Vuetify's ``mdAndUp``
breakpoint, so the mobile cases resize the viewport before loading the page.
"""

from playwright.sync_api import ViewportSize, expect

from tests.conftest import Dashboard
from tests.support.locators import (
    ACCOUNT_ICON,
    HELP_ICON,
    MENU_ICON,
    PREFERENCES_ICON,
    icon_button,
)

MOBILE_VIEWPORT = ViewportSize(width=600, height=900)
# Matched as plain text rather than a regex: Playwright compiles a Python pattern into a
# JS regex literal, and the "/" in "NDIP/NOVA" would terminate it early. Vuetify also
# renders a v-img as two image elements, hence .first on the logo lookups.
CITATION_BUTTON = "button:has-text('Citing NDIP/NOVA')"


def test_11_1_desktop_header_shows_individual_icons(dashboard: Dashboard) -> None:
    """11.1 A wide viewport shows the full app bar with each control as its own icon."""
    page = dashboard.open("")

    expect(page.get_by_role("img", name="NOVA Logo").first).to_be_visible()
    expect(page.get_by_role("img", name="Galaxy Square Logo").first).to_be_visible()
    expect(page.locator(CITATION_BUTTON)).to_be_visible()
    expect(icon_button(page, HELP_ICON)).to_be_visible()
    expect(icon_button(page, PREFERENCES_ICON)).to_be_visible()
    expect(icon_button(page, ACCOUNT_ICON)).to_be_visible()
    expect(icon_button(page, MENU_ICON)).to_have_count(0)


def test_11_2_mobile_header_collapses_into_a_hamburger(dashboard: Dashboard) -> None:
    """11.2 A narrow viewport collapses the header into a single hamburger menu."""
    dashboard.page.set_viewport_size(MOBILE_VIEWPORT)
    page = dashboard.open("")

    hamburger = icon_button(page, MENU_ICON)
    expect(hamburger).to_be_visible()
    expect(icon_button(page, HELP_ICON)).to_have_count(0)

    hamburger.click()

    expect(page.get_by_text("Logged in as scientist@ornl.gov")).to_be_visible()
    expect(page.get_by_text("About This Dashboard")).to_be_visible()
    expect(page.get_by_text("0 Running Tools")).to_be_visible()


def test_11_3_logo_navigates_home(dashboard: Dashboard) -> None:
    """11.3 The logo returns to the home page from anywhere."""
    page = dashboard.open("imaging")

    expect(page.get_by_text("Imaging Applications")).to_be_visible()
    page.get_by_role("img", name="NOVA Logo").first.click()

    expect(page.get_by_text("Welcome to the NOVA Dashboard")).to_be_visible()


def test_11_4_galaxy_icon_links_out(dashboard: Dashboard) -> None:
    """11.4 The Galaxy icon opens the Galaxy instance in a new tab, with an alias tooltip."""
    page = dashboard.open("")

    link = page.locator('a:has(img[alt="Galaxy Square Logo"])')
    expect(link).to_have_attribute("href", "http://galaxy.invalid")
    expect(link).to_have_attribute("target", "_blank")

    link.hover()
    expect(page.locator(".v-tooltip").get_by_text("NDIP", exact=True)).to_be_visible()


def test_11_5_citation_panel_shows_dois(dashboard: Dashboard) -> None:
    """11.5 The citation panel shows the citation text and its DOI links."""
    page = dashboard.open("")

    page.locator(CITATION_BUTTON).click()

    expect(page.get_by_text("Please do not forget to cite NDIP", exact=False)).to_be_visible()

    # The first DOI is linked from the paper's title, the second from the URL itself.
    expect(page.locator('a[href="https://doi.org/10.1093/nar/gkae410"]')).to_be_visible()
    expect(page.get_by_role("link", name="https://doi.org/10.1007/978-3-031-23606-8_9")).to_be_visible()


def test_11_6_help_panel_shows_version_and_links(dashboard: Dashboard) -> None:
    """11.6 The help panel shows the dashboard version, changelog and documentation links."""
    page = dashboard.open("")

    icon_button(page, HELP_ICON).click()

    expect(page.get_by_text("The dashboard is currently running version", exact=False)).to_be_visible()
    expect(page.get_by_role("link", name="View Changelog")).to_have_attribute("href", "http://nova.invalid/changelog")
    expect(page.get_by_text("Acknowledgement Statement")).to_be_visible()
