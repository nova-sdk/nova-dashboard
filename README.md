# Introduction

This repository is for the source code of the NOVA dashboard (running at https://nova.ornl.gov). The dashboard provides a
way for users to launch interactive tools without going through Calvera.

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

## Testing

`tests/RUN_SHEET.md` is the manual QA checklist for the dashboard UI. Most of its cases now
have automated Playwright coverage under `src/vue/tests`, run with:

```bash
cd src/vue
pnpm exec playwright install --with-deps chromium  # once per machine
pnpm run test:user-interface
```

This starts its own Vite dev server and runs entirely against mocked `/api/**` responses
(see `src/vue/tests/mocks`) - no Django, Galaxy, Prometheus, or GitLab connectivity is
required. Rows in `tests/RUN_SHEET.md` still marked `(TODO)`, or paired with a `test.fixme`
in the user interface suite, remain manual-only for now.

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
