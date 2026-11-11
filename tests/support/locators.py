"""Shared locators for the user interface suite.

The app carries no ``data-testid`` or ``aria-label`` attributes, so everything here is
pinned to visible text, ARIA roles, or Vuetify's own classes. That coupling is the price
of not instrumenting the frontend, so every such selector lives in this one module -
a Vuetify upgrade or a copy edit should only ever need fixing here.
"""

import re
from typing import Union

from playwright.sync_api import Locator, Page, expect

# Header icon buttons, which render as icon-only Vuetify buttons with no accessible name.
ACTIVE_TOOLS_ICON = "mdi-laptop"
ACCOUNT_ICON = "mdi-account-circle"
HELP_ICON = "mdi-help"
PREFERENCES_ICON = "mdi-cogs"
TOOLS_FAB_ICON = "mdi-tools"
COPY_LINK_ICON = "mdi-content-copy"
DOCUMENTATION_ICON = "mdi-file-document"
MENU_ICON = "mdi-menu"


def icon_button(page: Page, icon_class: str) -> Locator:
    """Locate an icon-only Vuetify button by the mdi class of the icon it contains."""
    return page.locator(f"button:has(i.{icon_class})")


def icon_control(scope: Union[Page, Locator], icon_class: str) -> Locator:
    """Locate an icon-only control by its icon, whether it renders as a button or a link.

    Vuetify renders a ``v-btn`` as an ``<a>`` as soon as it is given an ``href``, which is
    how ToolListItem's copy-link and documentation controls are built, so matching on
    ``button`` alone silently finds nothing. ``scope`` may be a page or a single row.
    """
    return scope.locator(f"button:has(i.{icon_class}), a:has(i.{icon_class})")


def tool_row(page: Page, tool_name: str) -> Locator:
    """Locate a single ToolListItem row by its tool name.

    Matches on a word boundary rather than a bare substring: the default fixtures
    include a *Visualize* tool whose description is "Visualizes reduced data.", which a
    substring search for "Reduce" would also hit.
    """
    escaped = re.escape(tool_name)

    return page.locator(".v-list-item").filter(has_text=re.compile(rf"\b{escaped}\b"))


def wait_for_row_settled(row: Locator) -> None:
    """Wait out a tool row's transient "Checking login status" state.

    ``ToolListItem`` renders that disabled button until the job store's first monitor
    pass sets ``has_monitored``, then swaps in the real Start/Open/Stop controls.
    Clicking without waiting races that swap.
    """
    expect(row.get_by_role("button", name="Checking login status")).to_have_count(0)


def status_banner(page: Page) -> Locator:
    """Locate the system status banner, which is the first banner on every page."""
    return page.locator(".v-banner").first
