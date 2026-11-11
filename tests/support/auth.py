"""Mocks for the dashboard's login state.

Neither ``/api/whoami`` nor ``/api/users/{id}/api_key`` is a Django route in this repo -
in production they are served by the NDIP infrastructure sitting in front of the app (see
``src/vue/src/stores/user.js``). The suite deliberately leaves ``VITE_MOCK_USER_EMAIL``
and ``VITE_MOCK_USER_API_KEY`` unset in ``.env.user-interface`` so that both the
logged-in and logged-out paths run for real, and mocks these two endpoints instead.

``App.vue`` gates its ``<RouterView>`` on ``user.ready``, which only flips once
``/api/whoami`` resolves, so one of these must always be installed or no route renders.
"""

import json
import re
from typing import Any, Dict, Optional

from playwright.sync_api import Page, Route

DEFAULT_USER = {"id": "42", "email": "scientist@ornl.gov"}
DEFAULT_API_KEY = "test-api-key-123"


def mock_logged_out(page: Page) -> None:
    """Resolve ``/api/whoami`` to ``null``, the shape an unauthenticated user gets."""

    def handler(route: Route) -> None:
        route.fulfill(status=200, content_type="application/json", body="null")

    page.route(re.compile(r"/api/whoami"), handler)


def mock_logged_in(
    page: Page,
    user: Optional[Dict[str, Any]] = None,
    api_key: str = DEFAULT_API_KEY,
) -> Dict[str, Any]:
    """Resolve ``/api/whoami`` to ``user`` and serve that user's API key."""
    account = dict(user or DEFAULT_USER)

    def whoami(route: Route) -> None:
        route.fulfill(status=200, content_type="application/json", body=json.dumps(account))

    def api_key_handler(route: Route) -> None:
        # stores/user.js reads this as text and strips one quote, matching Galaxy's
        # habit of returning a bare JSON string.
        route.fulfill(status=200, content_type="text/plain", body=f'"{api_key}"')

    page.route(re.compile(r"/api/whoami"), whoami)
    page.route(re.compile(r"/api/users/[^/]+/api_key"), api_key_handler)

    return account
