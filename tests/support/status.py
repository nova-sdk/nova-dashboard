"""Mocks for the system status banner's two Django endpoints.

``src/vue/src/assets/js/alerts.js`` builds a fixed set of seven service groups
(Infrastructure, Authentication Services, Instrument Data, ONCat, Compute Resources,
Live Data, Documentation) and then fans two of them out over the monitoring *targets*:

* ``Compute Resources`` gets one child per target in the ``compute`` group
* ``Instrument Data`` gets one child per ``compute`` target, each of which in turn holds
  one child per known instrument mount (HFIR-*/SNS-*)

An alert is attached to a group by its ``group`` key, and drills down to a child whose
name matches the alert's ``alias`` or ``host_alias``. A group's heading then reports
"(N of M up)" over its children, which is what RUN_SHEET 7.8 and 7.9 check.
"""

import json
import re
from typing import Any, Dict, List, Optional

from playwright.sync_api import Page, Route

COMPUTE_NODES = ["calvera-1", "calvera-2", "calvera-3", "calvera-4"]
IDP_NODES = ["idp-1", "idp-2"]


def default_targets() -> List[Dict[str, str]]:
    """Monitoring targets: four compute nodes and two authentication nodes."""
    return [{"group": "compute", "alias": node} for node in COMPUTE_NODES] + [
        {"group": "idp", "alias": node} for node in IDP_NODES
    ]


def alert(
    group: str = "compute",
    severity: str = "warning",
    alias: Optional[str] = None,
    host_alias: Optional[str] = None,
) -> Dict[str, Any]:
    """Build one Prometheus-shaped alert.

    ``alias`` names the child the alert belongs to (a compute node, for the
    ``compute`` group); ``host_alias`` is how an instrument-mount alert names the node
    it was observed on.
    """
    payload: Dict[str, Any] = {"group": group, "severity": severity}
    if alias is not None:
        payload["alias"] = alias
    if host_alias is not None:
        payload["host_alias"] = host_alias

    return payload


class StatusController:
    """Mutable alert state, so a test can change alerts between 5s poll cycles (7.10)."""

    def __init__(
        self,
        alerts: Optional[List[Dict[str, Any]]] = None,
        targets: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """Start with the given alerts (none by default) and the default targets."""
        self.alerts: List[Dict[str, Any]] = list(alerts or [])
        self.targets: List[Dict[str, str]] = list(targets if targets is not None else default_targets())
        # When True, the alerts endpoint fails and the banner enters its "unavailable"
        # state, which hides the hover card entirely.
        self.unavailable = False

    def set_alerts(self, *alerts: Dict[str, Any]) -> None:
        """Replace the active alerts."""
        self.alerts = list(alerts)


def mock_status(page: Page, controller: Optional[StatusController] = None) -> StatusController:
    """Route the alerts and targets endpoints to ``controller``'s state."""
    state = controller or StatusController()

    def targets_handler(route: Route) -> None:
        if state.unavailable:
            route.fulfill(status=500, content_type="application/json", body=json.dumps({"err": "down"}))
            return
        route.fulfill(status=200, content_type="application/json", body=json.dumps(state.targets))

    def alerts_handler(route: Route) -> None:
        if state.unavailable:
            route.fulfill(status=500, content_type="application/json", body=json.dumps({"err": "down"}))
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"alerts": state.alerts}),
        )

    page.route(re.compile(r"/api/status/targets/"), targets_handler)
    page.route(re.compile(r"/api/status/alerts/"), alerts_handler)

    return state
