# Dashboard interactions with Galaxy

The below table documents all of the points at which this dashboard communicates with
Galaxy.

## Browser → Galaxy

Cycle in the below table refers to a single iteration of the monitoring loop.

| # | Request | Frequency |
| --- | --- | --- |
| G1 | `GET /api/whoami` | once every 2s |
| G2 | `GET /api/users/{id}/api_key` | once post-login |
| G3 | `GET /api/tools?tool_help=true` | once per page load, pre-mount |
| G4 | `GET /api/histories` | once on first use of a Galaxy history |
| G5 | `POST /api/histories` | once on first use of a Galaxy history that didn't previously exit |
| G6 | `POST /api/tools` | once per tool launch |
| G7 | `GET /api/jobs?…` | ×5 per cycle (galaxy.js:354-381) |
| G8 | `GET /api/jobs/{id}` | 100 ms in `waitForJob`; per datafile job per cycle |
| G9 | `GET /api/jobs/{id}?full=true` | once per errored job per cycle (stderr) |
| G10 | `DELETE /api/jobs/{id}` | once per stop |
| G11 | `GET /api/entry_points?job_id=` | once per non-terminal job per cycle until job URL is found |
| G12 | `GET {entry point target}` | once per non-terminal job per cycle until job URL returns 200 |
| G13 | `GET /api/events/stream` (SSE) | once when `startMonitor` is called |

## Browser → Django → Galaxy

This endpoint still needs to go through Django as we must not expose the
GitLab access token to browser clients.

| # | Request | Frequency |
| --- | --- | --- |
| D1 | `POST api/issue/` | once per issue submission |
