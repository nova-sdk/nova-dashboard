# Introduction

This repository is for the source code of the NOVA dashboard (running at https://nova.ornl.gov). The dashboard provides a
way for users to launch interactive tools without going through Galaxy's default UI.

## Install dependencies

You will need to install [Pixi](https://pixi.sh/latest/) and [pnpm](https://pnpm.io/). After doing so, you can run
the following commands to build the source code.

```bash
pixi install
pixi run ./manage.py migrate
```

```bash
cd src/vue
pnpm i
```

## Run

To configure and run the app properly, a `.env` file is needed in the top level directory of this repository.
A sample file `.env.sample` is provided that describes the available configuration options. Because your `.env` may contain
secrets, make sure this does not get committed to the upstream repository. You can also set the environment variables
manually in your environment or prefix them to your run command.

After your environment is configured, run the following to start the client:

```bash
cd src/vue
pnpm run dev --host 0.0.0.0 --port 5173
```

After that to start the application (from the root directory):

```bash
pixi run ./manage.py runserver_plus --insecure 0.0.0.0:8080
```

## Develop

Pixi will create a `.pixi` folder containing a virtual environment for this project. Please configure your IDE to use this environment.

Maintaining healthy interaction between this dashboard and Galaxy is critical to the long-term health of this project. Please read, refer to, and help maintain [docs/galaxy-interactions.md](docs/galaxy-interactions.md) when working to ensure that we manage interaction with Galaxy in a stable manner.

## Testing

The test suite is a Playwright-driven set of user interface tests written in Python, under
[`tests/`](tests/). They drive the real Vue client in a headless browser and mock every
backend call at the browser's network layer, so **no Django server, database, Galaxy,
Prometheus or GitLab instance is needed** - and nothing the tests do can reach a real
service.

Each test maps to a case in [`tests/RUN_SHEET.md`](tests/RUN_SHEET.md), the manual
checklist they automate; test names carry the run-sheet ID (`test_4_5_...` covers 4.5).

Install the browser once, then run them:

```bash
pixi run playwright install chromium
pixi run pytest
```

Useful variations:

```bash
pixi run pytest -k "launch"        # one area
pixi run pytest --headed           # watch it in a real browser window
pixi run pytest --headed --slowmo 500
pixi run pytest --tracing on       # write a trace to test-results/ for `playwright show-trace`
```

The suite starts its own Vite dev server on port 5173 in `user-interface` mode and shuts
it down afterwards. If something is already serving that port - your own `pnpm run dev`,
say - it reuses it instead which will likely cause confusing failures.

Configuration for that mode lives in [`.env.user-interface`](.env.user-interface), which is
committed and contains no secrets. Two of its values are deliberate: `VITE_BASE_PATH=/`
(the header hides its Login button via a `/launch` path check that only matches at the
root), and empty `VITE_MOCK_USER_*` (setting those makes the client skip `/api/whoami`
entirely, which would make the logged-out state impossible to test).

## Load testing

Artillery load profiles for the dashboard API, the static client and the Galaxy calls the browser makes
directly live in `loadtest/`. See [loadtest/README.md](loadtest/README.md) for how to run them.

```bash
cd loadtest
pnpm install
pnpm run load:local
```

## Docker

### Build the image

without conda and mantid:

```bash
docker build . -f dockerfiles/Dockerfile -t app --platform {your_build_platform}
```

### Run the container

```bash
docker run -p 8080:8080 -it --env-file {path/to/your/.env} app
```

then open your browser at http://localhost:8080
