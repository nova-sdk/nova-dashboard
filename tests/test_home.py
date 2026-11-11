"""RUN_SHEET section 2: the home page's category grid."""

import re

from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.galaxy import DASHBOARD_HISTORY


def test_2_1_shows_one_card_per_category_excluding_generic_tools(dashboard: Dashboard) -> None:
    """2.1 Every category gets a card with its name and description, except generic-tools.

    ``diffraction`` is absent too: the client drops a category whose tools are all
    filtered out by the tool-prefix rule.
    """
    page = dashboard.open("")

    expect(page.get_by_role("link", name="Imaging")).to_be_visible()
    expect(page.get_by_text("Tools for imaging techniques.")).to_be_visible()
    expect(page.get_by_role("link", name="Spectroscopy")).to_be_visible()
    expect(page.get_by_text("Tools for spectroscopy techniques.")).to_be_visible()

    expect(page.get_by_role("link", name="Generic Tools")).to_have_count(0)
    expect(page.get_by_role("link", name="Diffraction")).to_have_count(0)


def test_2_2_clicking_a_category_card_navigates_to_it(dashboard: Dashboard) -> None:
    """2.2 A category card navigates to that category's page."""
    page = dashboard.open("")

    page.get_by_role("link", name="Imaging").click()

    expect(page).to_have_url(re.compile(r"/imaging$"))
    expect(page.get_by_text("Imaging Applications")).to_be_visible()


def test_2_3_job_monitoring_polls_in_the_background(dashboard: Dashboard) -> None:
    """2.3 The job monitor starts polling Galaxy once the home page is open."""
    dashboard.jobs.history_id(DASHBOARD_HISTORY)
    page = dashboard.open("")

    job_requests: list[str] = []
    page.on(
        "request",
        lambda request: job_requests.append(request.url) if "/api/jobs" in request.url else None,
    )

    dashboard.advance_job_poll(2)
    page.wait_for_timeout(300)

    assert job_requests, "expected the job monitor to query Galaxy's jobs API"
