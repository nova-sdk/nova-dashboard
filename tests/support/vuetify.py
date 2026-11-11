"""Mock for ``GET /api/vuetify_config/``.

``src/vue/src/main.js`` fetches this before it even creates the Vue app, so nothing
renders until it resolves. The real payload ships with ``nova-trame`` and carries the
component defaults and theme colors that the suite's assertions rely on (error/warning
banner colors, button styling), so this serves that same file rather than a stub - the
Django view it stands in for does exactly the same thing.
"""

import json
import re
from importlib.resources import files

from playwright.sync_api import Page, Route


def _config() -> str:
    asset = files("nova.trame.view.theme.assets").joinpath("vuetify_config.json")

    return json.dumps(json.loads(asset.read_text()))


def mock_vuetify_config(page: Page) -> None:
    """Serve nova-trame's real Vuetify configuration."""
    body = _config()

    def handler(route: Route) -> None:
        route.fulfill(status=200, content_type="application/json", body=body)

    page.route(re.compile(r"/api/vuetify_config/"), handler)
