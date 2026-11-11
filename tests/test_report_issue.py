"""RUN_SHEET section 9: the Report Issue form.

``BugPanel.submit`` waits a deliberate second before showing the outcome, so the tests
advance the mocked clock past that delay rather than sleeping.
"""

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.auth import DEFAULT_USER
from tests.support.issue import ISSUE_URL

SUPPORT_EMAIL = "ndip-support@ornl.gov"
SUBMIT_DELAY_MS = 1200


# The panel is a v-menu nested inside its trigger button, so the trigger's accessible name
# contains the whole form - including the word "Submit". Every lookup for the form's own
# controls therefore has to be exact.
def _open_panel(dashboard: Dashboard, logged_in: bool = True) -> None:
    page = dashboard.open("", logged_in=logged_in)
    page.get_by_role("button", name="Report Issue").click()


def test_9_1_logged_out_shows_support_email_only(dashboard: Dashboard) -> None:
    """9.1 Logged out, the panel offers only a support email and no form."""
    _open_panel(dashboard, logged_in=False)
    page = dashboard.page

    expect(page.get_by_text("You must be logged in to directly report issues.")).to_be_visible()
    expect(page.get_by_role("link", name=SUPPORT_EMAIL)).to_be_visible()
    expect(page.get_by_label("Please Describe Your Issue")).to_have_count(0)


def test_9_2_logged_in_shows_the_form_with_prefilled_email(dashboard: Dashboard) -> None:
    """9.2 Logged in, the form prefills a disabled Email field with the user's address."""
    _open_panel(dashboard)
    page = dashboard.page

    email = page.get_by_label("Email Address")
    expect(email).to_have_value(DEFAULT_USER["email"])
    expect(email).to_be_disabled()
    expect(page.get_by_label("Topic")).to_be_visible()
    expect(page.get_by_label("Please Describe Your Issue")).to_be_visible()


def test_9_3_submit_disabled_until_topic_and_description_are_set(dashboard: Dashboard) -> None:
    """9.3 Submit stays disabled until both Topic and Description are filled in."""
    _open_panel(dashboard)
    page = dashboard.page
    submit = page.get_by_role("button", name="Submit", exact=True)

    expect(submit).to_be_disabled()

    page.get_by_label("Please Describe Your Issue").fill("Something went wrong.")
    expect(submit).to_be_disabled()

    page.get_by_label("Topic").fill("Other")
    page.get_by_role("option", name="Other").first.click()
    expect(submit).to_be_enabled()


def test_9_4_topic_lists_categories_and_general_issues(dashboard: Dashboard) -> None:
    """9.4 The Topic list covers every tool plus a General Issues group."""
    _open_panel(dashboard)
    page = dashboard.page

    page.get_by_label("Topic").click()

    expect(page.get_by_text("General Issues")).to_be_visible()
    expect(page.get_by_role("option", name="Login Issue")).to_be_visible()
    expect(page.get_by_role("option", name="Problem Starting Tools")).to_be_visible()
    expect(page.get_by_role("option", name="Reconstruct").first).to_be_visible()


def test_9_5_submitting_shows_a_spinner(dashboard: Dashboard) -> None:
    """9.5 Submission shows progress for the second it deliberately waits."""
    _open_panel(dashboard)
    page = dashboard.page
    _fill_form(dashboard)

    page.get_by_role("button", name="Submit", exact=True).click()

    expect(page.locator(".v-overlay-container .v-progress-circular")).to_be_visible()


def test_9_6_successful_submission_links_the_issue(dashboard: Dashboard) -> None:
    """9.6 A successful submission reports the new issue's URL and resets the form."""
    _open_panel(dashboard)
    page = dashboard.page
    _fill_form(dashboard)

    page.get_by_role("button", name="Submit", exact=True).click()
    dashboard.advance(SUBMIT_DELAY_MS)

    expect(page.get_by_text("Issue was opened successfully.", exact=False)).to_be_visible()
    expect(page.get_by_role("link", name=ISSUE_URL)).to_have_attribute("href", ISSUE_URL)
    expect(page.get_by_label("Please Describe Your Issue")).to_have_value("")

    assert dashboard.issues.submissions
    assert dashboard.issues.submissions[0]["description"] == "Something went wrong."


def test_9_7_failed_submission_shows_a_generic_error(dashboard: Dashboard) -> None:
    """9.7 A failure reports a generic message and resets the form.

    The real view answers with a bodyless 400, so this must not depend on JSON.
    """
    dashboard.issues.succeed = False
    _open_panel(dashboard)
    page = dashboard.page
    _fill_form(dashboard)

    page.get_by_role("button", name="Submit", exact=True).click()
    dashboard.advance(SUBMIT_DELAY_MS)

    expect(page.get_by_text("Something went wrong while submitting your issue.", exact=False)).to_be_visible()
    expect(page.get_by_label("Please Describe Your Issue")).to_have_value("")


def test_9_8_description_is_capped_at_500_characters(dashboard: Dashboard) -> None:
    """9.8 The description field caps input at its 500-character limit."""
    _open_panel(dashboard)
    page = dashboard.page

    description = page.get_by_label("Please Describe Your Issue")
    description.fill("x" * 600)

    assert len(description.input_value()) == 500


def _fill_form(dashboard: Dashboard) -> None:
    """Fill the form with a valid topic and description."""
    page = dashboard.page
    page.get_by_label("Please Describe Your Issue").fill("Something went wrong.")
    page.get_by_label("Topic").fill("Other")
    page.get_by_role("option", name="Other").first.click()
