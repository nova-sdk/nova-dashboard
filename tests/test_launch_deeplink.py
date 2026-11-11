"""RUN_SHEET section 5: the auto-launch deep link route (/launch/:tool).

These rely on ``VITE_BASE_PATH=/``: the layouts hide the header Login button via
``route.path.startsWith("/launch")``, which only matches at the root (see
``.env.user-interface``).
"""

import re

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.galaxy import DASHBOARD_HISTORY

TOOL_ID = "nova_reconstruct"
LAUNCH_PATH = f"launch/{TOOL_ID}"


def test_5_1_logged_out_prompts_to_log_in(dashboard: Dashboard) -> None:
    """5.1 Logged out, the route asks the user to log in and hides the header Login."""
    page = dashboard.open(LAUNCH_PATH, logged_in=False)

    expect(page.get_by_text("You must log in before your tool can be launched.")).to_be_visible()

    # The header's own Login button is suppressed on this route, leaving only the one in
    # the view body.
    expect(page.get_by_role("link", name="Login")).to_have_count(1)


def test_5_2_login_returns_to_the_same_deep_link(dashboard: Dashboard) -> None:
    """5.2 The login link round-trips back to the same /launch/:tool URL."""
    page = dashboard.open(LAUNCH_PATH, logged_in=False)

    expect(page.get_by_role("link", name="Login")).to_have_attribute(
        "href", f"http://galaxy.invalid/login/start?redirect=/{LAUNCH_PATH}"
    )


def test_5_3_launches_automatically_exactly_once(dashboard: Dashboard) -> None:
    """5.3 With no existing job and no parameters, the tool launches once and only once."""
    dashboard.jobs.history_id(DASHBOARD_HISTORY)
    page = dashboard.open(LAUNCH_PATH)

    dashboard.wait_for_launch(TOOL_ID)
    dashboard.advance_job_poll(3)
    page.wait_for_timeout(300)

    launches = [launch for launch in dashboard.jobs.launches if launch["tool_id"] == TOOL_ID]
    assert len(launches) == 1, f"expected exactly one launch, got {len(launches)}"


def test_5_4_existing_job_is_reused(dashboard: Dashboard) -> None:
    """5.4 An already-running job for the tool is reused rather than duplicated."""
    dashboard.jobs.add_job(TOOL_ID, state="running", history=DASHBOARD_HISTORY, ready=False)

    page = dashboard.open(LAUNCH_PATH)
    dashboard.advance_job_poll(3)
    page.wait_for_timeout(300)

    assert dashboard.jobs.launches == [], "expected no new launch when a job already runs"


def test_5_5_parameterized_deep_link_always_launches(dashboard: Dashboard) -> None:
    """5.5 A parameterized deep link launches a new job even when one already runs."""
    dashboard.jobs.add_job(TOOL_ID, state="running", history=DASHBOARD_HISTORY, ready=False)

    page = dashboard.open(f"{LAUNCH_PATH}?param=value")
    dashboard.wait_for_launch(TOOL_ID)
    page.wait_for_timeout(300)

    launches = [launch for launch in dashboard.jobs.launches if launch["tool_id"] == TOOL_ID]
    assert launches, "expected a parameterized deep link to launch regardless"
    assert launches[0]["inputs"] == {"param": "value"}


def test_5_6_shows_progress_while_launching(dashboard: Dashboard) -> None:
    """5.6 While the launch is in flight the route shows progress and status text."""
    dashboard.jobs.history_id(DASHBOARD_HISTORY)
    page = dashboard.open(LAUNCH_PATH)

    dashboard.wait_for_launch(TOOL_ID)
    dashboard.jobs.set_state(TOOL_ID, state="running", target="")
    dashboard.advance_job_poll()

    # Scoped to the view's own card: the footer carries a second, unrelated spinner.
    card = page.locator(".v-card-text")
    expect(card.locator(".v-progress-circular")).to_be_visible()
    expect(card).to_contain_text("Initializing application...")
    expect(page.locator(".v-card-title")).to_contain_text("Reconstruct")


def test_5_8_and_5_9_ready_tool_redirects_without_a_history_entry(dashboard: Dashboard) -> None:
    """5.8/5.9 A ready tool hard-redirects, and Back does not return to the launch URL.

    ``LaunchView`` uses ``location.replace``, so the launch URL is overwritten in the
    session history rather than pushed - the regression 5.9 guards against.
    """
    dashboard.jobs.history_id(DASHBOARD_HISTORY)
    page = dashboard.open("")
    page.goto(f"{page.url}{LAUNCH_PATH}", wait_until="domcontentloaded")

    job = dashboard.wait_for_launch(TOOL_ID)
    job["target"] = f"/interactivetool/{job['id']}/"
    dashboard.jobs.set_state(TOOL_ID, state="running", ready=True)
    dashboard.advance_job_poll(2)

    page.wait_for_url(re.compile(r"/interactivetool/"), timeout=15000)

    page.go_back()
    expect(page).not_to_have_url(re.compile(re.escape(LAUNCH_PATH)))


def test_5_10_unknown_tool_redirects_to_not_found(dashboard: Dashboard) -> None:
    """5.10 A deep link for an unknown tool id redirects to the 404 view."""
    page = dashboard.open("launch/not-a-real-tool")

    expect(page.get_by_text("The content you requested could not be found.")).to_be_visible()
