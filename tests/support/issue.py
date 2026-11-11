"""Mock for ``POST /api/issue/``, behind the header's Report Issue panel.

``BugPanel.vue`` reads ``url`` out of a 200 response to build its success message, and
treats anything else as a generic failure - the real Django view returns a bodyless 400
on error, which is why the failure path must not assume JSON.
"""

import json
import re
from typing import Any, Dict, List, Optional

from playwright.sync_api import Page, Route

ISSUE_URL = "http://code.invalid/ndip/nova-dashboard/-/issues/1"


class IssueController:
    """Records submitted issues and decides whether submission succeeds."""

    def __init__(self, succeed: bool = True, url: str = ISSUE_URL) -> None:
        """Succeed by default, returning ``url`` as the created issue's link."""
        self.succeed = succeed
        self.url = url
        self.submissions: List[Dict[str, Any]] = []


def mock_issue(page: Page, controller: Optional[IssueController] = None) -> IssueController:
    """Route issue submission to ``controller``."""
    state = controller or IssueController()

    def handler(route: Route) -> None:
        state.submissions.append(route.request.post_data_json or {})

        if not state.succeed:
            # Mirrors HttpResponseBadRequest("unable to process request"): not JSON.
            route.fulfill(status=400, content_type="text/plain", body="unable to process request")
            return

        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"url": state.url}),
        )

    page.route(re.compile(r"/api/issue/"), handler)

    return state
