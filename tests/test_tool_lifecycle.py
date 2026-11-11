"""RUN_SHEET section 4: the launch/stop lifecycle of a tool row (ToolListItem).

The job store polls Galaxy every 2s, so each step here mutates :class:`JobController`
state and then advances the mocked clock past a poll rather than waiting in real time.
"""

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.galaxy import DASHBOARD_HISTORY
from tests.support.locators import DOCUMENTATION_ICON, tool_row, wait_for_row_settled

TOOL = "Reconstruct"
TOOL_ID = "nova_reconstruct"


def test_4_1_logged_out_row_prompts_to_sign_in(dashboard: Dashboard) -> None:
    """4.1 Logged out, a tool row offers a disabled "Sign in to run apps" button."""
    page = dashboard.open("imaging", logged_in=False)

    button = tool_row(page, TOOL).get_by_role("button", name="Sign in to run apps")
    expect(button).to_be_visible()
    expect(button).to_be_disabled()


def test_4_2_row_waits_for_the_first_monitor_poll(dashboard: Dashboard) -> None:
    """4.2 Before the first monitor pass resolves the row reads "Checking login status"."""
    dashboard.jobs.history_id(DASHBOARD_HISTORY)

    # Hold the jobs query open so has_monitored cannot flip while the assertion runs.
    dashboard.page.route("**/api/jobs**", lambda route: None)

    page = dashboard.open("imaging")

    button = tool_row(page, TOOL).get_by_role("button", name="Checking login status")
    expect(button).to_be_visible()
    expect(button).to_be_disabled()


def test_4_3_start_shows_progress(dashboard: Dashboard) -> None:
    """4.3 Clicking Start replaces the button with launch progress."""
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    dashboard.start_tool(row, TOOL_ID)
    dashboard.advance_job_poll()

    expect(row.locator(".v-progress-circular")).to_be_visible()
    assert dashboard.jobs.launches, "expected Start to launch the tool"
    assert dashboard.jobs.launches[0]["tool_id"] == TOOL_ID


def test_4_4_slow_launch_shows_a_warning(dashboard: Dashboard) -> None:
    """4.4 A launch still without a URL after 10s warns that it is taking unusually long."""
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    dashboard.start_tool(row, TOOL_ID)

    # Keep the job running but never give it an entry point, which is the state the
    # warning is meant to describe.
    dashboard.jobs.set_state(TOOL_ID, state="running", target="")
    dashboard.advance_job_poll()
    # ToolStatus arms its warning on a 100ms interval and then waits a further 10s.
    dashboard.advance(11000)

    warning = row.locator("i.mdi-information-outline")
    expect(warning).to_be_visible()

    warning.hover()
    expect(page.get_by_text("This is taking longer than usual")).to_be_visible()
    expect(page.get_by_text("system status banner", exact=False)).to_be_visible()


def test_4_5_ready_tool_offers_open_and_stop(dashboard: Dashboard) -> None:
    """4.5 Once the tool URL is ready the row offers Open alongside Stop."""
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    dashboard.start_tool(row, TOOL_ID)

    job = dashboard.jobs.set_state(TOOL_ID, state="running", ready=True)
    job["target"] = f"/interactivetool/{job['id']}/"
    dashboard.advance_job_poll(2)

    expect(row.get_by_role("link", name="Open")).to_be_visible()
    expect(row.get_by_role("button", name="Stop")).to_be_visible()


def test_4_6_open_targets_a_new_tab(dashboard: Dashboard) -> None:
    """4.6 Open points at the tool URL and opens it in a new tab."""
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    job = dashboard.start_tool(row, TOOL_ID)
    job["target"] = f"/interactivetool/{job['id']}/"
    dashboard.jobs.set_state(TOOL_ID, state="running", ready=True)
    dashboard.advance_job_poll(2)

    link = row.get_by_role("link", name="Open")
    expect(link).to_have_attribute("target", "_blank")
    expect(link).to_have_attribute("href", f"http://galaxy.invalid/interactivetool/{job['id']}/")


def test_4_7_autoopen_preference_opens_the_tool_itself(dashboard: Dashboard) -> None:
    """4.7 With the auto-open preference set, a ready tool opens without clicking Open."""
    page = dashboard.open("imaging")
    page.evaluate("window.localStorage.setItem('autoopen', 'true')")
    page = dashboard.open("imaging")

    row = tool_row(page, TOOL)
    wait_for_row_settled(row)
    job = dashboard.start_tool(row, TOOL_ID)
    job["target"] = f"/interactivetool/{job['id']}/"

    with page.context.expect_page() as new_tab:
        dashboard.jobs.set_state(TOOL_ID, state="running", ready=True)
        dashboard.advance_job_poll(2)

    assert "/interactivetool/" in new_tab.value.url


def test_4_8_stop_returns_the_row_to_launchable(dashboard: Dashboard) -> None:
    """4.8 Stopping a running tool puts the row back into its Start state."""
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    job = dashboard.start_tool(row, TOOL_ID)
    job["target"] = f"/interactivetool/{job['id']}/"
    dashboard.jobs.set_state(TOOL_ID, state="running", ready=True)
    dashboard.advance_job_poll(2)

    row.get_by_role("button", name="Stop").click()
    dashboard.advance_job_poll(2)

    expect(row.get_by_role("button", name="Start")).to_be_visible()


def test_4_9_finished_tool_shows_a_snackbar(dashboard: Dashboard) -> None:
    """4.9 A tool that finishes announces itself in a 5s auto-dismissing snackbar."""
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    job = dashboard.start_tool(row, TOOL_ID)
    job["target"] = f"/interactivetool/{job['id']}/"
    dashboard.jobs.set_state(TOOL_ID, state="running", ready=True)
    dashboard.advance_job_poll(2)

    dashboard.jobs.set_state(TOOL_ID, state="ok", ready=False, target="")
    dashboard.advance_job_poll(2)

    snackbar = page.get_by_text(f"{TOOL} finished running.")
    expect(snackbar).to_be_visible()

    dashboard.advance(5500)
    expect(snackbar).not_to_be_visible()


def test_4_13_tool_without_documentation_has_no_doc_button(dashboard: Dashboard) -> None:
    """4.13 A tool with no documentation link renders no documentation button.

    The sibling *Visualize* tool does have one, which keeps this from passing merely
    because the button never renders at all.
    """
    page = dashboard.open("imaging")

    expect(tool_row(page, TOOL).locator(f"i.{DOCUMENTATION_ICON}")).to_have_count(0)
    expect(tool_row(page, "Visualize").locator(f"i.{DOCUMENTATION_ICON}")).to_have_count(1)


def test_4_10_launch_failure_reports_an_error(dashboard: Dashboard) -> None:
    """4.10 A launch that Galaxy rejects outright reports an error to the user.

    Flagged TODO in the run sheet as impractical to force by hand; mocking the launch
    endpoint makes it routine.
    """
    dashboard.jobs.launch_error = "tool is not installed"
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    row.get_by_role("button", name="Start").click()
    dashboard.advance_job_poll()

    expect(page.locator(".v-banner.bg-error")).to_contain_text("NDIP failed to process your request.")


def test_4_10_failed_job_shows_its_stderr(dashboard: Dashboard) -> None:
    """4.10 A job that fails after launching surfaces Galaxy's own error text."""
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    dashboard.start_tool(row, TOOL_ID)
    dashboard.jobs.set_state(TOOL_ID, state="error", stderr="Traceback: tool blew up")
    dashboard.advance_job_poll(2)

    expect(page.locator(".v-banner.bg-error")).to_contain_text("Traceback: tool blew up")


def test_4_10_tpv_denial_is_shown_to_the_user(dashboard: Dashboard) -> None:
    """4.10 A job denied before dispatch reports the reason from its output dataset.

    A TPV rule rejecting the user leaves ``stderr`` empty and puts the reason on the
    output dataset's ``misc_info`` instead - the path added in v2.0.1 (commit fae4506).
    """
    page = dashboard.open("imaging")
    row = tool_row(page, TOOL)
    wait_for_row_settled(row)

    dashboard.start_tool(row, TOOL_ID)
    dashboard.jobs.set_state(
        TOOL_ID,
        state="error",
        stderr="",
        misc_info="Your account is not permitted to run this tool.",
    )
    dashboard.advance_job_poll(2)

    expect(page.locator(".v-banner.bg-error")).to_contain_text("Your account is not permitted to run this tool.")
