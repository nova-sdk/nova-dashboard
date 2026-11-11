"""RUN_SHEET section 1: login, logout and session handling.

The real OAuth round trip against Galaxy cannot run here, so the tests assert on the
login link the dashboard builds (1.2, 1.3) rather than following it. 1.5 likewise checks
the logout target instead of logging out of Galaxy for real.
"""

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.auth import DEFAULT_USER
from tests.support.locators import ACCOUNT_ICON, ACTIVE_TOOLS_ICON, PREFERENCES_ICON, icon_button


def test_1_1_logged_out_header_shows_login_only(dashboard: Dashboard) -> None:
    """1.1 Logged out, the header offers Login and hides the signed-in controls."""
    page = dashboard.open("", logged_in=False)

    expect(page.get_by_role("link", name="Login")).to_be_visible()
    expect(icon_button(page, PREFERENCES_ICON)).to_have_count(0)
    expect(icon_button(page, ACCOUNT_ICON)).to_have_count(0)
    # The Active Tools button uses v-show rather than v-if, so it stays in the DOM and is
    # hidden by CSS whenever there are no running tools.
    expect(icon_button(page, ACTIVE_TOOLS_ICON)).to_be_hidden()


def test_1_2_login_from_home_returns_to_home(dashboard: Dashboard) -> None:
    """1.2 The login link carries the home path, so Galaxy sends the user back to it."""
    page = dashboard.open("", logged_in=False)

    expect(page.get_by_role("link", name="Login")).to_have_attribute(
        "href", "http://galaxy.invalid/login/start?redirect=/"
    )


def test_1_3_login_from_category_returns_to_category(dashboard: Dashboard) -> None:
    """1.3 The login link carries the current category path, not the home path."""
    page = dashboard.open("imaging", logged_in=False)

    expect(page.get_by_role("link", name="Login")).to_have_attribute(
        "href", "http://galaxy.invalid/login/start?redirect=/imaging"
    )


def test_1_4_account_menu_shows_user_email(dashboard: Dashboard) -> None:
    """1.4 The account menu names the signed-in user and offers a Galaxy logout."""
    page = dashboard.open("")

    icon_button(page, ACCOUNT_ICON).click()

    expect(page.get_by_text(f"Logged in as {DEFAULT_USER['email']}")).to_be_visible()
    expect(page.get_by_role("link", name="Logout via NDIP")).to_be_visible()


def test_1_5_logout_points_at_galaxy_user_page(dashboard: Dashboard) -> None:
    """1.5 Logout sends the user to Galaxy's own user page."""
    page = dashboard.open("")

    icon_button(page, ACCOUNT_ICON).click()

    expect(page.get_by_role("link", name="Logout via NDIP")).to_have_attribute("href", "/user")


def test_1_6_switched_user_forces_reload(dashboard: Dashboard) -> None:
    """1.6 A user id that changes mid-session force-reloads rather than showing stale state.

    ``stores/user.js`` re-polls ``/api/whoami`` every 2s and reloads the page when the id
    it gets back differs from the one it already holds, which is how a Galaxy account
    switch in another tab is noticed.
    """
    page = dashboard.open("")

    expect(page.get_by_text("Welcome to the NOVA Dashboard")).to_be_visible()

    reloaded: list[str] = []
    page.on("framenavigated", lambda frame: reloaded.append(frame.url))

    # Swap the identity the endpoint reports, then let the login timer fire.
    dashboard.page.route(
        "**/api/whoami",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"id": "99", "email": "other@ornl.gov"}',
        ),
    )
    dashboard.advance_job_poll(2)
    page.wait_for_timeout(500)

    assert reloaded, "expected the dashboard to reload after the user id changed"
