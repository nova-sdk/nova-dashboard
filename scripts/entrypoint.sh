#!/bin/bash

cd /opt/run/vue
pnpm build

service nginx restart

cd /opt/run/django
pixi run python manage.py migrate
pixi run python -m gunicorn --log-level debug src.launcher_app.asgi:application -k uvicorn.workers.UvicornWorker -w 4
