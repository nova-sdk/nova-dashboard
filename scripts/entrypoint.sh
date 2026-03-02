#!/bin/bash

cd /opt/run/vue
pnpm build

cp /etc/nginx/nginx.conf.template /etc/nginx/nginx.conf
service nginx restart

cd /opt/run/django
pixi run python manage.py migrate
pixi run python -m gunicorn src.launcher_app.asgi:application -k uvicorn.workers.UvicornWorker -w 4
