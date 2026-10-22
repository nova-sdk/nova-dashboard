# Load tests

[Artillery](https://www.artillery.io/) load profiles for the NOVA dashboard.

Two profiles, because the dashboard's traffic splits across two servers that fail in different ways:

| File               | Target                     | What it loads                                                         |
| ------------------ | -------------------------- | --------------------------------------------------------------------- |
| `artillery.yml`    | Dashboard (nginx + Django) | Static client, `/api/vuetify_config/`, `/api/status/*`, `/api/issue/` |
| `galaxy.yml`       | Galaxy (e.g. `ndip-test`)  | Tool panel and job-monitoring polling the browser does directly       |

`galaxy.yml` exists because the Django Galaxy proxy was removed: `src/vue/src/assets/js/galaxy.js` now calls
Galaxy straight from the browser, so that load never passes through the dashboard server and would be invisible
in a dashboard-only run.

## Setup

```bash
cd loadtest
pnpm install
```

## Running

```bash
pnpm run load:local    # http://localhost:8080
pnpm run load:dev      # https://nova-dev.ornl.gov
pnpm run load:test     # https://nova-test.ornl.gov
pnpm run load:smoke    # 20s shakeout run, for checking the profile itself
```

Any other target:

```bash
pnpm artillery run -t https://your-dashboard-host artillery.yml
```

Please don't run this against a production system, though. -_-

An HTML report:

```bash
pnpm run load:report   # writes results.json, then results.html
```

If you need to take a quick break from work:

```bash
pnpm artillery dino
```

### Galaxy

```bash
LOAD_GALAXY_API_KEY=<key> pnpm artillery run -t https://ndip-dev.ornl.gov galaxy.yml
```

Without `LOAD_GALAXY_API_KEY` only the public tool-panel scenario runs; the job-monitoring scenario skips every
step rather than failing.

This profile is read-only, as it is mainly meant to test the ability of Galaxy to cope with large numbers of monitoring requests simultaneously.

## Configuration

| Variable                   | Default                    | Purpose                                                              |
| -------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `LOAD_BASE_PATH`           | `/`                        | Must match `VITE_BASE_PATH`; the client builds URLs as `${base}api/` |
| `LOAD_SLOW_MS`             | `1000`                     | Threshold for the per-endpoint `slow.*` counters                     |
| `LOAD_GALAXY_API_KEY`      | unset                      | Galaxy API key for the authenticated scenarios                       |
| `LOAD_GALAXY_HISTORY_NAME` | `launcher_history`         | Must match `VITE_GALAXY_HISTORY_NAME`                                |
| `LOAD_TOOL_PREFIX`         | `nova`                     | Must match `VITE_TOOL_PREFIX`; used to count dashboard tools         |
| `LOAD_ISSUE_EMAIL`         | `loadtest@example.invalid` | Reporter address on real submissions                                 |

Load levels are phases in the YAML. `arrivalRate` is new sessions per second, and a polling session runs about
60 seconds, so steady-state concurrency is roughly `arrivalRate x 60`. The shipped `sustained` phase is about
120 concurrent dashboards. To change it without editing the file:

```bash
npx artillery run -e dev \
  --overrides '{"config":{"phases":[{"duration":300,"arrivalRate":5,"name":"heavy"}]}}' \
  artillery.yml
```

## Reading the results

Beyond Artillery's own metrics, the processor emits:

- `alerts.returned`, `alerts.payload_bytes` — how much Prometheus data each request processed. If latency climbs
  while these climb too, the bottleneck is the alert fan-out and not the dashboard.
- `targets.returned` — same for the targets view.
- `slow.<endpoint>` — responses over `LOAD_SLOW_MS`, so a single slow endpoint is not hidden by a healthy p95.
- `status_errors.<endpoint>.<code>` — non-2xx by endpoint.
- `alerts.malformed_response`, `targets.malformed_response`, `galaxy.tool_panel_not_json` — a 200 whose body is
  not what the client expects. Galaxy answers an invalid session with an HTML login page rather than a 4xx, so
  this is the only signal that an "ok" Galaxy run was really doing nothing.
- `galaxy.dashboard_tools`, `galaxy.tool_panel_sections`, `galaxy.tool_panel_bytes` — size of the tool panel
  every visitor downloads.

`artillery.yml` sets `config.ensure` thresholds (p95 1.5s, p99 3s, error rate 1%), so the run exits non-zero
when they are missed and can gate a pipeline.
