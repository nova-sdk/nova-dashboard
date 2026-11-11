"""RUN_SHEET section 7: the system status banner and its hover card.

The banner polls every 5s, so a test changes :class:`StatusController` state and then
advances the mocked clock past a poll.

7.6 and 7.7 are a pair: "configured, so the button shows" and "not configured, so it
does not". Only the second state is reachable today, so 7.6 is marked xfail - see its
docstring for why.
"""

import pytest
from playwright.sync_api import expect

from tests.conftest import Dashboard
from tests.support.locators import status_banner
from tests.support.status import COMPUTE_NODES, alert

NORMAL = "All NDIP systems are operating normally."
DEGRADED = "Some NDIP systems are experiencing degraded performance. Hover for details."
OUTAGE = "Some NDIP systems are experiencing outages. Hover for details."


def test_7_1_no_alerts_reads_operating_normally(dashboard: Dashboard) -> None:
    """7.1 With no active alerts the banner reports everything normal."""
    page = dashboard.open("")

    expect(status_banner(page)).to_have_text(NORMAL)


def test_7_2_warning_alert_degrades_the_banner(dashboard: Dashboard) -> None:
    """7.2 A warning-severity alert turns the banner to degraded performance."""
    page = dashboard.open("")

    dashboard.status.set_alerts(alert(severity="warning", alias=COMPUTE_NODES[0]))
    dashboard.advance_status_poll()

    expect(status_banner(page)).to_have_text(DEGRADED)


def test_7_3_critical_alert_reports_an_outage(dashboard: Dashboard) -> None:
    """7.3 A critical-severity alert turns the banner to an outage."""
    page = dashboard.open("")

    dashboard.status.set_alerts(alert(severity="critical", alias=COMPUTE_NODES[0]))
    dashboard.advance_status_poll()

    expect(status_banner(page)).to_have_text(OUTAGE)


def test_7_4_unreachable_monitoring_hides_the_card(dashboard: Dashboard) -> None:
    """7.4 When monitoring is unreachable the banner says so and the hover card is gone."""
    dashboard.status.unavailable = True
    page = dashboard.open("")

    expect(status_banner(page)).to_have_text("Unable to check NDIP status.")

    status_banner(page).hover()
    expect(page.get_by_text("NDIP System Status")).to_have_count(0)


def test_7_5_hover_card_lists_every_service_group(dashboard: Dashboard) -> None:
    """7.5 Hovering the banner opens a card listing each monitored service group."""
    page = dashboard.open("")

    status_banner(page).hover()

    expect(page.get_by_text("NDIP System Status")).to_be_visible()
    for name in (
        "Infrastructure",
        "Authentication Services",
        "Instrument Data",
        "ONCat",
        "Compute Resources",
        "Live Data",
        "Documentation",
    ):
        expect(page.get_by_text(name, exact=False).first).to_be_visible()


@pytest.mark.xfail(
    strict=True,
    reason=(
        "MONITORING_URL never reaches the browser: StatusPanel.vue renders the button from "
        "alertManager.monitoringUrl, but AlertManager (assets/js/alerts.js) never assigns that "
        "property and Django exposes the setting to no endpoint, so the button cannot render "
        "whatever the deployment is configured with. Wiring it up is what this test is waiting "
        "for; whoever does that should also give this test a way to configure the URL, then "
        "drop this marker."
    ),
)
def test_7_6_monitoring_details_button_links_out(dashboard: Dashboard) -> None:
    """7.6 With monitoring configured, the card offers a "View Monitoring Details" button."""
    page = dashboard.open("")

    status_banner(page).hover()
    expect(page.get_by_text("NDIP System Status")).to_be_visible()

    expect(page.get_by_role("link", name="View Monitoring Details")).to_be_visible()


def test_7_7_monitoring_details_button_is_absent(dashboard: Dashboard) -> None:
    """7.7 With no monitoring URL provided, no "View Monitoring Details" button is shown.

    This is the half of the 7.6/7.7 pair that the suite can actually set up, since nothing
    delivers a monitoring URL to the client.
    """
    page = dashboard.open("")

    status_banner(page).hover()
    expect(page.get_by_text("NDIP System Status")).to_be_visible()

    expect(page.get_by_role("link", name="View Monitoring Details")).to_have_count(0)


def test_7_8_compute_resources_breaks_down_per_node(dashboard: Dashboard) -> None:
    """7.8 Compute Resources reports how many of its nodes are up."""
    page = dashboard.open("")

    dashboard.status.set_alerts(alert(severity="critical", alias=COMPUTE_NODES[0]))
    dashboard.advance_status_poll()
    status_banner(page).hover()

    group = page.get_by_text("Compute Resources", exact=False).first
    expect(group).to_contain_text(f"({len(COMPUTE_NODES) - 1} of {len(COMPUTE_NODES)} up)")

    group.click()
    for node in COMPUTE_NODES:
        expect(page.get_by_text(node, exact=True).first).to_be_visible()


def test_7_9_instrument_data_drills_down_to_mounts(dashboard: Dashboard) -> None:
    """7.9 Instrument Data drills from compute node down to per-instrument mounts."""
    page = dashboard.open("")

    status_banner(page).hover()
    group = page.get_by_text("Instrument Data", exact=False).first
    expect(group).to_contain_text(f"({len(COMPUTE_NODES)} of {len(COMPUTE_NODES)} up)")

    group.click()
    node = page.get_by_text(COMPUTE_NODES[0], exact=False).first
    node.click()

    expect(page.get_by_text("SNS-CORELLI", exact=True).first).to_be_visible()


def test_7_10_nested_counts_update_live(dashboard: Dashboard) -> None:
    """7.10 Regression: nested counts update while the card stays open.

    ``AlertManager`` mutates its ``Service`` objects in place, so ``StatusPanel.vue`` has
    to wrap it in ``reactive()`` for the nested ``ServiceStatus`` rows to re-render. This
    is the bug tracked as ``66-system-status-sublists-aren-t-fully-reactive``.
    """
    page = dashboard.open("")

    status_banner(page).hover()
    group = page.get_by_text("Compute Resources", exact=False).first
    expect(group).to_contain_text(f"({len(COMPUTE_NODES)} of {len(COMPUTE_NODES)} up)")

    # Take a node down without touching the card, then let one poll cycle run.
    dashboard.status.set_alerts(alert(severity="critical", alias=COMPUTE_NODES[0]))
    dashboard.advance_status_poll()

    expect(group).to_contain_text(f"({len(COMPUTE_NODES) - 1} of {len(COMPUTE_NODES)} up)")

    # And back up again, to prove the count is genuinely tracking state.
    dashboard.status.set_alerts()
    dashboard.advance_status_poll()

    expect(group).to_contain_text(f"({len(COMPUTE_NODES)} of {len(COMPUTE_NODES)} up)")
