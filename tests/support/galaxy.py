"""Mocks for the dashboard's direct-to-Galaxy API calls.

Since v2.0 the SPA talks straight to Galaxy from the browser rather than through a Django
proxy (see the header comment of ``src/vue/src/assets/js/galaxy.js``), so every Galaxy
endpoint is intercepted here with ``page.route``.

:class:`JobController` holds the mock's state in Python. Tests mutate it between polls
and then advance the virtual clock, which is what drives the launch/stop lifecycle in
RUN_SHEET sections 4-6.

The endpoints below mirror what ``fetchJobStatus`` actually calls:

* ``GET /api/histories`` - resolved by *name*; a missing dashboard history short-circuits
  monitoring to an empty job list, so histories are created lazily on launch
* ``GET /api/jobs?history_id=&state=`` - per-history, per-state job list. A query with no
  ``history_id`` (``state=running``) returns jobs from *every* history, which is how the
  client discovers tools launched outside the dashboard
* ``GET /api/jobs/{id}[?full=true]`` - job detail, carrying params and stderr
* ``DELETE /api/jobs/{id}`` - cancel
* ``POST /api/tools`` - launch
* ``GET /api/entry_points?job_id=`` - an interactive tool's proxied target
* ``GET /api/events/stream`` - the Server-Sent Events channel
* the entry point's own URL - probed for readiness by ``probeToolUrl``
"""

import json
import re
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Page, Route

DASHBOARD_HISTORY = "launcher_history"
DATAFILE_HISTORY = f"{DASHBOARD_HISTORY}_datafile_tools"
EXTERNAL_HISTORY = "some_other_history"

# Galaxy serves interactive tools under this prefix; probeToolUrl() fetches it directly.
ENTRY_POINT_PREFIX = "/interactivetool"


class JobController:
    """Mutable Galaxy job state shared between a test and its mocked endpoints.

    A "job" here is a dict in roughly Galaxy's ``/api/jobs`` shape plus two mock-only
    keys: ``history`` (which named history it belongs to, which is how the client
    classifies dashboard vs datafile vs external jobs) and ``ready`` (whether its
    interactive-tool URL should pass the readiness probe).
    """

    def __init__(self) -> None:
        """Start with no histories and no jobs."""
        self._counter = 0
        self.jobs: List[Dict[str, Any]] = []
        # Only histories that exist are resolvable by name. fetchJobStatus() bails out
        # early when the dashboard history is missing, which is the correct behavior for
        # a user who has never launched anything.
        self.histories: Dict[str, str] = {}
        self.launch_error: Optional[str] = None
        # Every tool id POSTed to /api/tools, so tests can assert a deep link launched
        # exactly once (5.3) or launched again despite a running job (5.5).
        self.launches: List[Dict[str, Any]] = []

    def _next_id(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}-{self._counter}"

    def history_id(self, name: str) -> str:
        """Return the id of the named history, creating it if needed."""
        if name not in self.histories:
            self.histories[name] = self._next_id("history")
        return self.histories[name]

    def add_job(
        self,
        tool_id: str,
        state: str = "new",
        history: str = DASHBOARD_HISTORY,
        ready: bool = False,
        target: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        stderr: str = "",
        misc_info: str = "",
    ) -> Dict[str, Any]:
        """Add a job and return its record.

        ``target`` defaults to a per-job interactive-tool path; pass ``target=""`` to
        model a job Galaxy has not yet assigned an entry point to, which is what keeps a
        launch showing "launching" rather than "ready".
        """
        job_id = self._next_id("job")
        job = {
            "id": job_id,
            "tool_id": tool_id,
            "state": state,
            "history": history,
            "ready": ready,
            "target": f"{ENTRY_POINT_PREFIX}/{job_id}/" if target is None else target,
            "params": params or {},
            "stderr": stderr,
            "misc_info": misc_info,
        }
        self.history_id(history)
        self.jobs.append(job)
        return job

    def seed_external(self, tool_id: str, **kwargs: Any) -> Dict[str, Any]:
        """Seed a running job launched outside the dashboard (6.4).

        It lives in neither the dashboard nor the datafile history, so the client only
        finds it via the unscoped ``state=running`` query and flags it ``is_extra_tool``.
        """
        kwargs.setdefault("state", "running")
        kwargs.setdefault("ready", True)
        # The dashboard history must exist or monitoring short-circuits before it ever
        # runs the unscoped running-jobs query that surfaces external jobs.
        self.history_id(DASHBOARD_HISTORY)
        return self.add_job(tool_id, history=EXTERNAL_HISTORY, **kwargs)

    def seed_datafile(self, tool_id: str, params: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
        """Seed a running datafile-triggered job, which renders its parameters (6.5)."""
        kwargs.setdefault("state", "running")
        kwargs.setdefault("ready", True)
        self.history_id(DASHBOARD_HISTORY)
        return self.add_job(tool_id, history=DATAFILE_HISTORY, params=params, **kwargs)

    def get(self, tool_id: str) -> Dict[str, Any]:
        """Return the most recently added job for a tool."""
        for job in reversed(self.jobs):
            if job["tool_id"] == tool_id:
                return job
        raise AssertionError(f"no mocked job for tool_id {tool_id!r}; launch or seed it first")

    def set_state(self, tool_id: str, **patch: Any) -> Dict[str, Any]:
        """Patch the most recent job for a tool, e.g. to mark it running and ready."""
        job = self.get(tool_id)
        job.update(patch)
        return job

    def by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Return a job by its Galaxy id, or None."""
        return next((job for job in self.jobs if job["id"] == job_id), None)


def _job_payload(job: Dict[str, Any]) -> Dict[str, Any]:
    """Project a mock job record into Galaxy's ``/api/jobs`` list shape."""
    return {
        "id": job["id"],
        "tool_id": job["tool_id"],
        "state": job["state"],
        "history_id": job["history"],
        "create_time": "2026-01-01T00:00:00.000000",
    }


def _fulfill(route: Route, payload: Any, status: int = 200) -> None:
    route.fulfill(
        status=status,
        content_type="application/json",
        body=json.dumps(payload),
    )


def mock_galaxy(page: Page, controller: JobController) -> JobController:
    """Route every Galaxy call the SPA makes to ``controller``'s state."""
    _mock_histories(page, controller)
    _mock_jobs(page, controller)
    _mock_launch(page, controller)
    _mock_entry_points(page, controller)
    _mock_datasets(page, controller)
    mock_event_stream(page)
    _mock_tool_probe(page, controller)

    return controller


def _mock_histories(page: Page, controller: JobController) -> None:
    def handler(route: Route) -> None:
        request = route.request
        if request.method == "POST":
            name = (request.post_data_json or {}).get("name", "")
            _fulfill(route, {"id": controller.history_id(name), "name": name})
            return

        _fulfill(
            route,
            [{"id": history_id, "name": name} for name, history_id in controller.histories.items()],
        )

    page.route(re.compile(r"/api/histories(\?|$)"), handler)


def _mock_jobs(page: Page, controller: JobController) -> None:
    detail_pattern = re.compile(r"/api/jobs/([^/?]+)")

    def handler(route: Route) -> None:
        request = route.request
        parsed = urlparse(request.url)
        detail = detail_pattern.search(parsed.path)

        if detail:
            job_id = detail.group(1)
            job = controller.by_id(job_id)
            if job is None:
                _fulfill(route, {"err_msg": "job not found"}, status=404)
                return
            if request.method == "DELETE":
                job["state"] = "deleted"
                _fulfill(route, {"id": job_id})
                return
            _fulfill(route, _job_detail(job))
            return

        _fulfill(route, _job_list(controller, parse_qs(parsed.query)))

    page.route(re.compile(r"/api/jobs"), handler)


def _job_detail(job: Dict[str, Any]) -> Dict[str, Any]:
    """Galaxy's ``GET /api/jobs/{id}`` body.

    ``outputs`` names the job's output dataset so that ``jobErrorText`` can fall back to
    the dataset's ``misc_info`` when ``stderr`` is empty - the shape a TPV denial takes.
    """
    payload = _job_payload(job)
    payload["params"] = {"chromInfo": "/ignored", "dbkey": "?", **job["params"]}
    payload["stderr"] = job["stderr"]
    payload["outputs"] = {"output": {"src": "hda", "id": f"dataset-{job['id']}"}}
    return payload


def _job_list(controller: JobController, query: Dict[str, List[str]]) -> List[Dict[str, Any]]:
    history_ids = query.get("history_id", [])
    states = query.get("state", [])
    limit = int(query.get("limit", ["0"])[0] or 0)

    matches = []
    for job in controller.jobs:
        if history_ids and controller.histories.get(job["history"]) not in history_ids:
            continue
        if states and job["state"] not in states:
            continue
        matches.append(_job_payload(job))

    return matches[:limit] if limit else matches


def _mock_datasets(page: Page, controller: JobController) -> None:
    """Serve a job's output dataset, whose ``misc_info`` carries Galaxy's failure message.

    A job that dies before dispatch - a TPV rule denying the user permission to run the
    tool, say - has no stderr at all, and Galaxy puts the reason on the output dataset
    instead. ``jobErrorText`` falls back to this, so without it a TPV denial would reach
    the user as an empty error.
    """

    def handler(route: Route) -> None:
        dataset_id = urlparse(route.request.url).path.rsplit("/", 1)[-1]
        job = controller.by_id(dataset_id.removeprefix("dataset-"))

        _fulfill(
            route,
            {
                "id": dataset_id,
                "misc_info": job["misc_info"] if job else "",
                "state": job["state"] if job else "ok",
            },
        )

    page.route(re.compile(r"/api/datasets/"), handler)


def _mock_launch(page: Page, controller: JobController) -> None:
    def handler(route: Route) -> None:
        body = route.request.post_data_json or {}
        tool_id = body.get("tool_id", "")
        inputs = dict(body.get("inputs") or {})
        controller.launches.append({"tool_id": tool_id, "inputs": inputs})

        if controller.launch_error is not None:
            _fulfill(route, {"err_msg": controller.launch_error}, status=500)
            return

        history = DATAFILE_HISTORY if inputs else DASHBOARD_HISTORY
        job = controller.add_job(tool_id, state="new", history=history, params=inputs, target="")
        _fulfill(
            route,
            {
                "jobs": [{"id": job["id"]}],
                "outputs": [{"id": f"dataset-{job['id']}"}],
            },
        )

    # POST /api/tools is the launch call; the tool *panel* is a GET on the same path and
    # is mocked separately, so match on method here.
    def dispatch(route: Route) -> None:
        if route.request.method == "POST":
            handler(route)
        else:
            route.fallback()

    page.route(re.compile(r"/api/tools"), dispatch)


def _mock_entry_points(page: Page, controller: JobController) -> None:
    def handler(route: Route) -> None:
        query = parse_qs(urlparse(route.request.url).query)
        job_id = query.get("job_id", [""])[0]
        job = controller.by_id(job_id)

        if job is None or not job["target"]:
            _fulfill(route, [])
            return

        _fulfill(route, [{"id": f"ep-{job_id}", "job_id": job_id, "target": job["target"]}])

    page.route(re.compile(r"/api/entry_points"), handler)


def _mock_tool_probe(page: Page, controller: JobController) -> None:
    """Answer ``probeToolUrl``'s fetch of an interactive tool's URL.

    The client treats a 200 whose body lacks Galaxy's placeholder markers as ready, so
    an unready job is modelled by returning the real "Proxy target missing" page.
    """

    def handler(route: Route) -> None:
        path = urlparse(route.request.url).path
        job = next((job for job in controller.jobs if job["target"] and job["target"] in path), None)
        ready = bool(job and job["ready"])

        route.fulfill(
            status=200,
            content_type="text/html",
            body="<html><body>Tool</body></html>" if ready else "<html><body>Proxy target missing</body></html>",
        )

    # Registered on the context, not just the page: the auto-open preference opens the
    # tool in a new tab, and a page-scoped route would not apply to it.
    page.context.route(re.compile(rf"{ENTRY_POINT_PREFIX}/"), handler)


# Replaces window.EventSource before any app code runs.
#
# Galaxy's SSE channel cannot usefully be mocked with page.route: route.fulfill always
# completes the response, which closes the stream, and stores/job.js reports a closed
# stream to the user as "live job updates were interrupted". Nothing a route can return
# keeps a connection open, so the browser-side constructor is replaced instead.
#
# The stub also makes the event-driven path testable: tests push real
# entry_point_update/history_update events through emit_sse() rather than relying only
# on the store's fallback poll.
_EVENT_SOURCE_STUB = """
(() => {
    const sources = [];

    class FakeEventSource {
        constructor(url) {
            this.url = url;
            this.readyState = FakeEventSource.CONNECTING;
            this.withCredentials = true;
            this._listeners = {};
            sources.push(this);

            if (window.__novaSseFail) {
                // Model SSE being disabled on the Galaxy side: a non-retryable failure
                // leaves readyState CLOSED, which is what job.js branches on.
                queueMicrotask(() => {
                    this.readyState = FakeEventSource.CLOSED;
                    this._emit('error', {});
                });
                return;
            }

            // A microtask, not a timer: page.clock mocks setTimeout, so a timer here
            // would not fire until a test advanced the clock, but queueMicrotask still
            // lets the app attach its listeners first.
            queueMicrotask(() => {
                this.readyState = FakeEventSource.OPEN;
                this._emit('open', {});
            });
        }

        addEventListener(type, handler) {
            (this._listeners[type] ||= []).push(handler);
        }

        removeEventListener(type, handler) {
            this._listeners[type] = (this._listeners[type] || []).filter((h) => h !== handler);
        }

        close() {
            this.readyState = FakeEventSource.CLOSED;
            const index = sources.indexOf(this);
            if (index >= 0) sources.splice(index, 1);
        }

        _emit(type, event) {
            for (const handler of this._listeners[type] || []) {
                handler(event);
            }
        }
    }

    FakeEventSource.CONNECTING = 0;
    FakeEventSource.OPEN = 1;
    FakeEventSource.CLOSED = 2;

    window.EventSource = FakeEventSource;

    // Dispatches a Galaxy event to every open stream, as the real server would.
    window.__novaEmitSse = (type, data) => {
        for (const source of [...sources]) {
            source._emit(type, { data: JSON.stringify(data ?? {}) });
        }
        return sources.length;
    };
})();
"""


def mock_event_stream(page: Page, fail: bool = False) -> None:
    """Install the EventSource stub standing in for Galaxy's SSE channel.

    ``stores/job.js`` opens this stream and surfaces any failure as a user-visible
    ``galaxy_error`` banner, so an unmocked or closed stream would put an error banner on
    every page under test.

    Pass ``fail=True`` to model SSE being disabled on the Galaxy side, the non-retryable
    case that tells the user live updates are unavailable.
    """
    if fail:
        page.add_init_script("window.__novaSseFail = true;")

    page.add_init_script(_EVENT_SOURCE_STUB)

    # Belt and braces: nothing should reach the network, but if some other code path
    # opens the real endpoint, answer it rather than letting it hit galaxy.invalid.
    def handler(route: Route) -> None:
        route.fulfill(status=200, content_type="text/event-stream", body=": connected\n\n")

    page.route(re.compile(r"/api/events/stream"), handler)


def emit_sse(page: Page, event_type: str, data: Optional[Dict[str, Any]] = None) -> int:
    """Push a Galaxy SSE event into the page, returning how many streams received it."""
    result = page.evaluate(
        "([type, data]) => window.__novaEmitSse(type, data)",
        [event_type, data or {}],
    )

    return int(result)


def mock_tool_panel(page: Page, panel: List[Dict[str, Any]]) -> None:
    """Mock Galaxy's public tool panel, which the router awaits before it is built."""

    def handler(route: Route) -> None:
        if route.request.method == "GET":
            _fulfill(route, panel)
        else:
            route.fallback()

    page.route(re.compile(r"/api/tools"), handler)


def mock_galaxy_unavailable(page: Page, status: int = 502) -> None:
    """Fail every call to the Galaxy origin, modelling Galaxy being down.

    Failing only the tool panel is not enough to observe an error in the UI: a monitor
    pass that succeeds clears ``galaxy_error`` again (see ``monitorJobs`` in
    ``stores/job.js``), so the banner would flicker and vanish. Matching on the Galaxy
    host leaves the dashboard's own Django endpoints - and ``/api/whoami``, without which
    nothing renders at all - untouched.
    """

    def handler(route: Route) -> None:
        _fulfill(route, {"err_msg": "Bad Gateway"}, status=status)

    page.route(re.compile(r"galaxy\.invalid/api/"), handler)
