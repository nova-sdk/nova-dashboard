"""Turns the Playwright user interface suite (src/vue/tests) into individual pytest tests.

The whole suite is run exactly once, at collection time, with Playwright's JSON reporter
capturing a structured pass/fail per test; pytest_generate_tests then parametrizes
test_user_interface.py's single `test_playwright` function over those results, so pytest
reports one line per RUN_SHEET-mapped case instead of a single pass/fail for the entire
suite. Running
each Playwright test as its own subprocess instead would be far slower, since every one
would pay for its own Vite dev server startup.

One consequence of collecting results this way: the whole suite runs during collection
regardless of any `-k`/`-m` filter applied afterwards, since pytest doesn't know which
tests exist (or their outcomes) until this hook has already run it.
"""

import functools
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import django
import pytest
from django.conf import settings as django_settings

# The Django settings module reads several environment variables that have no default
# (SECRET_KEY, REFRESH_TOKEN_KEY, DEBUG, GALAXY_URL) and would otherwise raise KeyError
# on import. These dummy values keep the view unit tests hermetic and independent of any
# developer .env file; setdefault means a real .env loaded some other way still wins.
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("REFRESH_TOKEN_KEY", "test-refresh-token-key")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("GALAXY_URL", "https://galaxy.example.test")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "src.launcher_app.settings")

django.setup()

# django.test.Client sends requests with HTTP_HOST=testserver, which ALLOWED_HOSTS
# (defined for real deployments in settings.py) doesn't include.
if "testserver" not in django_settings.ALLOWED_HOSTS:
    django_settings.ALLOWED_HOSTS.append("testserver")

VUE_DIR = Path(__file__).resolve().parent.parent / "src" / "vue"


def _playwright_installed() -> bool:
    return shutil.which("pnpm") is not None and (VUE_DIR / "node_modules" / "@playwright" / "test").exists()


def _last_result(test: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    results = test.get("results", [])
    return results[-1] if results else None


def _error_message(result: Optional[Dict[str, Any]]) -> Optional[str]:
    if result is None:
        return None

    errors = result.get("errors") or ([result["error"]] if result.get("error") else [])

    return "\n".join(error.get("message", str(error)) for error in errors) or None


def _flatten_specs(suite: Dict[str, Any], prefix: str = "") -> List[Dict[str, Any]]:
    """Recursively flatten a Playwright JSON reporter suite tree into {id, status, error} dicts.

    File suites contain nested describe-block suites, which contain specs, which contain
    one `tests` entry per project.
    """
    title = f"{prefix} › {suite['title']}" if prefix and suite.get("title") else prefix or suite.get("title", "")

    flattened = []
    for spec in suite.get("specs", []):
        spec_id = f"{title} › {spec['title']}" if title else spec["title"]
        for test in spec.get("tests", []):
            result = _last_result(test)
            status = result["status"] if result else "skipped"
            flattened.append({"id": spec_id, "status": status, "error": _error_message(result)})

    for child_suite in suite.get("suites", []):
        flattened.extend(_flatten_specs(child_suite, title))

    return flattened


@functools.lru_cache(maxsize=1)
def _run_playwright_suite() -> List[Dict[str, Any]]:
    if not _playwright_installed():
        return [
            {
                "id": "playwright suite not installed",
                "status": "skipped",
                "error": f"@playwright/test isn't installed in {VUE_DIR} - run `pnpm install` there first",
            }
        ]

    with tempfile.TemporaryDirectory() as tmp_dir:
        report_path = Path(tmp_dir) / "report.json"

        result = subprocess.run(
            ["pnpm", "exec", "playwright", "test", "--reporter=json"],
            cwd=VUE_DIR,
            capture_output=True,
            text=True,
            env={**os.environ, "PLAYWRIGHT_JSON_OUTPUT_FILE": str(report_path)},
        )

        if not report_path.exists():
            return [
                {
                    "id": "playwright suite",
                    "status": "failed",
                    "error": f"Produced no JSON report (exit {result.returncode}):\n{result.stdout}\n{result.stderr}",
                }
            ]

        report = json.loads(report_path.read_text())

    tests = [test for suite in report.get("suites", []) for test in _flatten_specs(suite)]

    return tests or [
        {
            "id": "playwright suite",
            "status": "failed",
            "error": "Playwright reported zero tests - check src/vue/tests and src/vue/playwright.config.js",
        }
    ]


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    if "pw_result" not in metafunc.fixturenames:
        return

    tests = _run_playwright_suite()
    metafunc.parametrize("pw_result", tests, ids=[test["id"] for test in tests])
