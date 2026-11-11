"""RUN_SHEET section 14: cross-cutting concerns.

14.1 and 14.2 cover Galaxy failing mid-session. The tool panel is fetched before the
router is even built, so a failure there is the one the user is most likely to meet, and
the dashboard reports it rather than rendering a broken page.
"""

import re

from playwright.sync_api import ViewportSize, expect

from tests.conftest import Dashboard
from tests.support.galaxy import emit_sse, mock_galaxy_unavailable
from tests.support.locators import (
    COPY_LINK_ICON,
    HELP_ICON,
    MENU_ICON,
    icon_button,
    icon_control,
    tool_row,
    wait_for_row_settled,
)

MOBILE_VIEWPORT = ViewportSize(width=600, height=900)
DESKTOP_VIEWPORT = ViewportSize(width=1280, height=900)


def test_14_1_galaxy_failure_is_reported_not_crashed(dashboard: Dashboard) -> None:
    """14.1 A failing Galaxy call surfaces a message instead of a blank page."""
    page = dashboard.open("")
    mock_galaxy_unavailable(page, status=502)

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".v-footer")
    dashboard.advance_job_poll(2)

    expect(page.locator(".bg-error").first).to_be_visible()
    # The shell still renders: the failure is reported, not fatal.
    expect(page.get_by_text("Welcome to the NOVA Dashboard")).to_be_visible()
    expect(page.get_by_role("link", name="Imaging")).to_have_count(0)
    assert dashboard.console_errors == [], dashboard.console_errors


def test_14_2_non_json_response_is_handled(dashboard: Dashboard) -> None:
    """14.2 A malformed, non-JSON response is handled without an unhandled exception."""
    page = dashboard.open("")
    # A regex, not a glob: "?" is a single-character wildcard in Playwright's glob syntax.
    page.route(
        re.compile(r"galaxy\.invalid/api/tools"),
        lambda route: route.fulfill(status=200, content_type="text/html", body="<html>oops</html>"),
    )

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".v-footer")
    dashboard.advance_job_poll(2)

    # The malformed body is swallowed as "no tools" rather than breaking the page. The
    # message the router sets for it is deliberately not asserted: a monitor pass that
    # succeeds clears galaxy_error again (stores/job.js), so the banner is transient
    # whenever only the tool panel is broken.
    expect(page.get_by_text("Welcome to the NOVA Dashboard")).to_be_visible()
    expect(page.get_by_role("link", name="Imaging")).to_have_count(0)
    assert dashboard.console_errors == [], dashboard.console_errors


def test_14_3_resizing_across_the_breakpoint_keeps_one_header(dashboard: Dashboard) -> None:
    """14.3 Crossing the mdAndUp breakpoint with a menu open duplicates no controls."""
    page = dashboard.open("")

    icon_button(page, HELP_ICON).click()
    expect(page.get_by_text("Acknowledgement Statement")).to_be_visible()

    page.set_viewport_size(MOBILE_VIEWPORT)
    expect(icon_button(page, MENU_ICON)).to_have_count(1)
    expect(icon_button(page, HELP_ICON)).to_have_count(0)

    page.set_viewport_size(DESKTOP_VIEWPORT)
    expect(icon_button(page, HELP_ICON)).to_have_count(1)
    expect(icon_button(page, MENU_ICON)).to_have_count(0)


def test_14_4_header_and_tool_row_are_keyboard_operable(dashboard: Dashboard) -> None:
    """14.4 Header controls and a tool row's Start button are reachable by keyboard."""
    page = dashboard.open("imaging")
    row = tool_row(page, "Reconstruct")
    wait_for_row_settled(row)

    start = row.get_by_role("button", name="Start")

    # Reach Start by tabbing, so this checks the control is in the natural tab order
    # rather than only that it works once focused. Tabbing starts from the row's own copy
    # button instead of walking the whole page: several header buttons are Vuetify menus
    # whose overlay traps focus once it opens, which makes a full-page tab walk flaky.
    copy_link = icon_control(row, COPY_LINK_ICON)
    copy_link.focus()
    expect(copy_link).to_be_focused()

    page.keyboard.press("Tab")
    expect(start).to_be_focused()

    page.keyboard.press("Enter")
    dashboard.wait_for_launch("nova_reconstruct")

    assert dashboard.jobs.launches, "expected Enter to activate the focused Start button"


def test_live_updates_refresh_without_waiting_for_a_poll(dashboard: Dashboard) -> None:
    """A Galaxy SSE event refreshes job state without waiting for the fallback poll.

    ``stores/job.js`` subscribes to ``history_update`` and ``entry_point_update`` and
    re-runs its monitor pass on either, so a tool becoming ready should appear promptly
    rather than up to one 2s poll later.
    """
    page = dashboard.open("imaging")
    row = tool_row(page, "Reconstruct")
    wait_for_row_settled(row)

    job = dashboard.start_tool(row, "nova_reconstruct")
    job["target"] = f"/interactivetool/{job['id']}/"
    dashboard.jobs.set_state("nova_reconstruct", state="running", ready=True)

    # No clock advance at all: the refresh has to come from the event itself.
    assert emit_sse(page, "history_update", {"history_id": "history-1"}) == 1

    expect(row.get_by_role("link", name="Open")).to_be_visible()


def test_unavailable_live_updates_are_reported(dashboard: Dashboard) -> None:
    """SSE being unavailable is reported to the user rather than failing silently.

    This is the non-retryable case - SSE disabled on the Galaxy side - which leaves the
    stream CLOSED and tells the user to refresh.
    """
    page = dashboard.open("imaging", sse_fail=True)

    expect(page.locator(".v-banner.bg-error")).to_contain_text("NDIP live job updates are unavailable.")
