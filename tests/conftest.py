"""Fixtures for the Playwright user interface suite.

The suite drives the real Vue client against a standalone Vite dev server and mocks every
backend call in the browser with ``page.route`` - no Django, Galaxy, Prometheus, GitLab or
database is involved. See ``tests/RUN_SHEET.md`` for the manual checklist these tests
automate, and the "Testing" section of ``README.md`` for how to run them.
"""

import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import pytest
from playwright.sync_api import Locator, Page

from tests.support.auth import mock_logged_in, mock_logged_out
from tests.support.galaxy import JobController, mock_event_stream, mock_galaxy, mock_tool_panel
from tests.support.issue import IssueController, mock_issue
from tests.support.status import StatusController, mock_status
from tests.support.tools import default_panel
from tests.support.vuetify import mock_vuetify_config

REPO_ROOT = Path(__file__).resolve().parent.parent

# Fixed, not arbitrary: src/vue/vite.config.js hardcodes `server.hmr.clientPort = 5173`,
# so the browser's HMR client always dials 5173 no matter which port the server binds.
# Serving on anything else leaves every page throwing WebSocket connection errors.
VITE_PORT = 5173
VITE_MODE = "user-interface"
SERVER_START_TIMEOUT = 90.0


def _vue_dir() -> Path:
    """Locate the directory to run Vite from.

    Overridable because the layouts differ: locally this is ``src/vue`` under the repo,
    while the Docker image installs node_modules at ``/opt/run/vue``. ``vite.config.js``
    resolves ``../../pyproject.toml`` and ``envDir: "../.."``, so whichever directory is
    used must sit two levels below the repo root.
    """
    override = os.environ.get("NOVA_VUE_DIR")

    return Path(override).resolve() if override else REPO_ROOT / "src" / "vue"


def _serving(url: str) -> bool:
    """Check whether the client is being served at ``url``.

    Deliberately an HTTP request rather than a socket probe: Vite binds "localhost",
    which on macOS resolves to IPv6 ``[::1]`` only, so a probe hardcoded to 127.0.0.1
    never sees it. Fetching the URL also proves Vite is actually ready to serve, not
    merely listening.
    """
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return bool(response.status == 200)
    except (urllib.error.URLError, OSError):
        return False


def _stop(process: "subprocess.Popen[str]") -> None:
    """Stop the Vite server and the node process it spawned."""
    for send in (signal.SIGTERM, signal.SIGKILL):
        if process.poll() is not None:
            return
        try:
            os.killpg(os.getpgid(process.pid), send)
        except (ProcessLookupError, PermissionError):
            process.kill()
            return
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            continue


@pytest.fixture(scope="session")
def vite_server() -> Iterator[str]:
    """Serve the client for the whole session, reusing a server already on the port.

    Reuse keeps a developer's own ``pnpm run dev`` usable and avoids a needless restart
    between runs; in CI nothing is listening, so the suite starts its own.
    """
    url = f"http://localhost:{VITE_PORT}/"

    if _serving(url):
        yield url
        return

    vue_dir = _vue_dir()
    if not (vue_dir / "node_modules").is_dir():
        pytest.skip(f"node_modules missing in {vue_dir} - run `pnpm install` there first")

    process = subprocess.Popen(
        [
            "pnpm",
            "exec",
            "vite",
            "--mode",
            VITE_MODE,
            "--port",
            str(VITE_PORT),
            "--strictPort",
        ],
        cwd=vue_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        # `pnpm exec` execs a child node process; without its own session, terminating
        # the wrapper would orphan that child and leave it holding the port.
        start_new_session=True,
    )

    deadline = time.monotonic() + SERVER_START_TIMEOUT
    while time.monotonic() < deadline:
        if process.poll() is not None:
            output = process.stdout.read() if process.stdout else ""
            raise RuntimeError(f"Vite exited with {process.returncode}:\n{output}")
        if _serving(url):
            break
        time.sleep(0.25)
    else:
        _stop(process)
        raise RuntimeError(f"Vite did not start within {SERVER_START_TIMEOUT}s")

    try:
        yield url
    finally:
        _stop(process)


@pytest.fixture(scope="session")
def base_url(vite_server: str) -> str:
    """Point Playwright's relative navigation at the Vite server.

    Note that ``VITE_BASE_PATH`` is part of this URL, so tests must call ``open()`` with
    paths that have no leading slash - a leading "/" would replace the whole base path.
    """
    return vite_server


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args: Dict[str, Any]) -> Dict[str, Any]:
    """Harden Chromium for containers, where the default /dev/shm is too small."""
    return {
        **browser_type_launch_args,
        "args": [*browser_type_launch_args.get("args", []), "--disable-dev-shm-usage"],
    }


class Dashboard:
    """A dashboard under test: mocked backends, plus the page they are installed on.

    Mutate the controllers before calling :meth:`open` to set the state the app loads
    into, and after it to drive state changes that a later poll picks up.
    """

    def __init__(self, page: Page) -> None:
        """Wire up empty backend state for ``page``."""
        self.page = page
        self.jobs = JobController()
        self.status = StatusController()
        self.issues = IssueController()
        self.user: Optional[Dict[str, Any]] = None
        self.console_errors: List[str] = []

        page.on("pageerror", lambda error: self.console_errors.append(str(error)))

    def open(
        self,
        path: str = "",
        logged_in: bool = True,
        panel: Optional[List[Dict[str, Any]]] = None,
        user: Optional[Dict[str, Any]] = None,
        sse_fail: bool = False,
    ) -> Page:
        """Install every mock, then navigate to ``path`` relative to the base URL.

        ``path`` must not start with "/" - see :func:`base_url`.
        """
        page = self.page

        # Installed before navigating so that every timer the app schedules (the 2s job
        # poll, the 5s status poll, the 10s slow-launch warning, the 5s snackbar) can be
        # fast-forwarded instead of waited out in real time.
        page.clock.install()

        mock_vuetify_config(page)
        mock_status(page, self.status)
        mock_issue(page, self.issues)
        mock_galaxy(page, self.jobs)

        if sse_fail:
            # Registered last so it takes precedence over the healthy stream that
            # mock_galaxy installed.
            mock_event_stream(page, fail=True)

        # Registered after mock_galaxy because both match /api/tools: Playwright tries
        # the most recently registered handler first, and this one falls back to
        # mock_galaxy's launch handler for POSTs.
        mock_tool_panel(page, default_panel() if panel is None else panel)

        if logged_in:
            self.user = mock_logged_in(page, user=user)
        else:
            mock_logged_out(page)

        page.goto(path, wait_until="domcontentloaded")
        # App.vue gates <RouterView> on user.ready, which only flips once /api/whoami has
        # resolved; waiting for the footer means the shell has rendered.
        page.wait_for_selector(".v-footer")

        return page

    def start_tool(self, row: "Locator", tool_id: str) -> Dict[str, Any]:
        """Click a tool row's Start button and wait for Galaxy to register the launch.

        The click only queues a POST to /api/tools; returning before that lands would let
        a test mutate job state that does not exist yet.
        """
        row.get_by_role("button", name="Start").click()

        return self.wait_for_launch(tool_id)

    def wait_for_launch(self, tool_id: str, timeout: float = 10.0) -> Dict[str, Any]:
        """Block until Galaxy records a launch of ``tool_id``, then return the new job.

        This waits on the POST itself rather than on a job merely existing: a test may have
        seeded a job for the same tool beforehand (a deep link reusing or bypassing a
        running job, say), and waiting for existence would return instantly and let the
        assertion run before the launch had been issued.
        """
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if any(launch["tool_id"] == tool_id for launch in self.jobs.launches):
                return self.jobs.get(tool_id)
            # Let the monitor poll run too: some flows only issue the POST once a monitor
            # pass has reported no existing job to reuse.
            self.advance_job_poll()
            self.page.wait_for_timeout(100)

        raise AssertionError(f"no launch was issued for {tool_id!r} within {timeout}s")

    def advance_job_poll(self, times: int = 1) -> None:
        """Advance virtual time past ``times`` job-monitor polls (stores/job.js: 2000ms)."""
        self.page.clock.run_for(2100 * times)

    def advance_status_poll(self, times: int = 1) -> None:
        """Advance virtual time past ``times`` status polls (StatusPanel.vue: 5000ms)."""
        self.page.clock.run_for(5100 * times)

    def advance(self, milliseconds: int) -> None:
        """Advance virtual time by an arbitrary amount."""
        self.page.clock.run_for(milliseconds)


@pytest.fixture
def dashboard(page: Page, base_url: str) -> Dashboard:
    """A dashboard with mockable backends; call ``.open()`` to navigate."""
    return Dashboard(page)
