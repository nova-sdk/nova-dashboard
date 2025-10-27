#!/bin/bash

cd /opt/run/vue
pnpm build

cd /opt/run/django
# Grab all of the OAuth redirect paths for injection into the nginx config.
paths=""
for provider in $OAUTH_PROVIDERS; do
    prefix=$(echo $provider | awk '{print toupper($1)}')
    redirect_var="${prefix}_REDIRECT_PATH"
    redirect_path=${!redirect_var}
    if [[ -n $paths ]]; then
        paths="${paths}|${redirect_path}"
    else
        paths=$redirect_path
    fi
done
export AUTH_REDIRECTS=$paths
envsubst '$AUTH_REDIRECTS' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
service nginx restart

poetry run python manage.py migrate
poetry run python -m gunicorn src.launcher_app.asgi:application -k uvicorn.workers.UvicornWorker -w 4
