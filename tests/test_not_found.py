"""RUN_SHEET section 13: the 404 / Not Found view."""

from playwright.sync_api import expect

from tests.conftest import Dashboard


def test_13_1_unmatched_path_shows_not_found(dashboard: Dashboard) -> None:
    """13.1 An arbitrary unmatched path renders NotFoundView with a Home button."""
    page = dashboard.open("this/does/not/exist")

    expect(page.get_by_text("The content you requested could not be found.")).to_be_visible()
    expect(page.get_by_role("link", name="Home")).to_be_visible()


def test_13_1_home_button_returns_to_home(dashboard: Dashboard) -> None:
    """13.1 The Home button on the 404 view navigates back to the home page."""
    page = dashboard.open("this/does/not/exist")

    page.get_by_role("link", name="Home").click()

    expect(page.get_by_text("Welcome to the NOVA Dashboard")).to_be_visible()
