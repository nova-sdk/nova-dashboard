"""One test per Playwright user interface test (src/vue/tests).

See conftest.py for how these are discovered and run, and tests/RUN_SHEET.md for the manual
checklist they're derived from.
"""

import pytest


def test_playwright(pw_result: dict) -> None:
    if pw_result["status"] == "skipped":
        pytest.skip(pw_result["error"] or "skipped")

    assert pw_result["status"] == "passed", pw_result["error"] or f"status: {pw_result['status']}"
