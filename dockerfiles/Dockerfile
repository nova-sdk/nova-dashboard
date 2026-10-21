FROM --platform=amd64 ubuntu:noble AS source
ARG DEBIAN_FRONTEND=noninteractive

# make sure image can run as non-root user
ENV PNPM_HOME=/pnpm

RUN apt update && apt upgrade -y && apt install -y \
    curl \
    gettext-base \
    libatomic1 \
    software-properties-common
RUN add-apt-repository ppa:deadsnakes/ppa -y
RUN apt update && apt install -y \
    python3.13
RUN curl https://nginx.org/keys/nginx_signing.key | gpg --dearmor | tee /usr/share/keyrings/nginx-archive-keyring.gpg >/dev/null
RUN echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://nginx.org/packages/ubuntu `lsb_release -cs` nginx" | tee /etc/apt/sources.list.d/nginx.list
RUN apt update && apt install -y nginx

# Install Node.js LTS & pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_26.x | bash -
RUN apt install -y nodejs
ENV SHELL=bash
RUN curl -fsSL https://get.pnpm.io/install.sh | sh -
ENV PATH="$PATH:$PNPM_HOME/bin"

# Setup Vue.js
ADD src/vue /opt/run/vue
WORKDIR /opt/run/vue
RUN pnpm install

# Setup Django
ADD ./ /opt/run/django
WORKDIR /opt/run/django

RUN curl -fsSL https://pixi.sh/install.sh | sh
ENV PATH="/root/.pixi/bin:${PATH}"
RUN pixi install
SHELL [ "pixi", "run", "--manifest-path", "/opt/run/django" ]
ENTRYPOINT [ "pixi", "run", "--manifest-path", "/opt/run/django" ]

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
