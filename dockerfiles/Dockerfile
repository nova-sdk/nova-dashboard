FROM --platform=amd64 ubuntu:noble AS source
ARG DEBIAN_FRONTEND=noninteractive

# make sure image can run as non-root user
ENV PNPM_HOME=/pnpm

RUN apt update && apt upgrade -y && apt install -y \
    curl \
    gettext-base \
    software-properties-common \
    nginx
RUN add-apt-repository ppa:deadsnakes/ppa -y
RUN apt update && apt install -y \
    python3.10

# Install Node.js LTS & pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt install -y nodejs
ENV SHELL=bash
RUN curl -fsSL https://get.pnpm.io/install.sh | sh -
ENV PATH="$PATH:$PNPM_HOME"

# Setup Django
ADD ./ /opt/run/django
WORKDIR /opt/run/django

RUN curl -fsSL https://pixi.sh/install.sh | sh
ENV PATH="/root/.pixi/bin:${PATH}"
RUN pixi install
SHELL [ "pixi", "run", "--manifest-path", "/opt/vue/django" ]
ENTRYPOINT [ "pixi", "run", "--manifest-path", "/opt/vue/django" ]

# Setup Vue.js
ADD src/vue /opt/run/vue
WORKDIR /opt/run/vue
RUN pnpm install

WORKDIR /opt/run/django
RUN chmod og+rwX -R /pnpm
RUN chmod og+rwX -R /opt/run/django
RUN chmod og+rwX -R /opt/run/vue


FROM source AS run

# Install dependencies only used in production builds
WORKDIR /opt/run/django
RUN pixi add --pypi gunicorn uvicorn-worker

# Create static client build
WORKDIR /opt/run/vue
RUN cp /opt/run/django/pyproject.toml /opt/pyproject.toml

ADD dockerfiles/nginx.conf.template /etc/nginx/nginx.conf.template
ADD scripts/entrypoint.sh /opt/run/entrypoint.sh
ADD manage.py /opt/run/django/manage.py

RUN mkdir -p /tmp
RUN mkdir -p /run/nginx

WORKDIR /opt/run/django
# Squash useless warning about missing .env file
RUN touch .env

ENTRYPOINT ["bash", "/opt/run/entrypoint.sh"]
