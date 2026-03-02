"""Django views for the launcher app.

These views implement the URL schema
specified in urls.py file.
"""

import json
from importlib.resources import open_text
from typing import Any

from django.conf import settings
from django.contrib.auth import logout
from django.contrib.auth.models import AbstractBaseUser
from django.core.exceptions import PermissionDenied
from django.http import (
    HttpRequest,
    HttpResponse,
    HttpResponseBadRequest,
    HttpResponseRedirect,
    JsonResponse,
    StreamingHttpResponse,
)
from django.shortcuts import redirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from requests import ConnectionError
from requests import request as proxy_request

from .galaxy import GalaxyManager
from .notification import NotificationManager
from .status import StatusManager


def is_admin(user: AbstractBaseUser) -> bool:
    return user.get_username() in settings.NOVA_ADMINS


@require_GET
def logout_user(request: HttpRequest) -> HttpResponseRedirect:
    logout(request)

    return redirect("/")


@require_GET
def get_vuetify_config(request: HttpRequest) -> JsonResponse:
    with open_text("nova.trame.view.theme.assets", "vuetify_config.json") as vuetify_config:
        return JsonResponse(json.load(vuetify_config))


@require_GET
def get_alerts(request: HttpRequest) -> JsonResponse:
    status_manager = StatusManager()

    alert_data = {
        "alerts": status_manager.get_alerts(),
        "url": settings.MONITORING_URL if request.user.is_authenticated and is_admin(request.user) else "",
    }

    return JsonResponse(alert_data)


@require_GET
def get_targets(request: HttpRequest) -> JsonResponse:
    status_manager = StatusManager()

    return JsonResponse(status_manager.get_targets(), safe=False)


def _create_galaxy_error(exception: Exception, **kwargs: Any) -> JsonResponse:
    message = str(exception)
    if isinstance(exception, json.JSONDecodeError):
        message = f"Unable to fetch tool list, {settings.GALAXY_URL} may be restarting."
    if isinstance(exception, ConnectionError) or "502 Bad Gateway" in message:
        message = f"Unable to connect to Galaxy, {settings.GALAXY_URL} may be restarting."

    return JsonResponse({"error": message, **kwargs}, status=500)


@require_POST
def galaxy_launch(request: HttpRequest) -> HttpResponse:
    # Normally, we would use a @login_required decorator in Django. This forces a redirect, though, which we don't want
    # to happen since this view (and others like it below) are only accessed through fetch requests.
    if not request.user.is_authenticated:
        raise PermissionDenied()

    try:
        data = json.loads(request.body)
        galaxy_manager = GalaxyManager(data.get("api_key", ""))

        job_id = galaxy_manager.launch_job(data.get("tool_id", None), data.get("inputs", {}))

        return JsonResponse({"id": job_id})
    except Exception as e:
        return _create_galaxy_error(e)


@require_POST
def galaxy_monitor(request: HttpRequest) -> JsonResponse:
    if not request.user.is_authenticated:
        raise PermissionDenied()

    try:
        data = json.loads(request.body)
        galaxy_manager = GalaxyManager(data.get("api_key", ""))

        return JsonResponse({"jobs": galaxy_manager.monitor_jobs(data["tool_ids"])})
    except Exception as e:
        return _create_galaxy_error(e)


@require_POST
def galaxy_stop(request: HttpRequest) -> HttpResponse:
    if not request.user.is_authenticated:
        raise PermissionDenied()

    try:
        data = json.loads(request.body)
        galaxy_manager = GalaxyManager(data.get("api_key", ""))

        galaxy_manager.stop_job(data.get("job_id", None))

        return HttpResponse()
    except Exception as e:
        return _create_galaxy_error(e)


@ensure_csrf_cookie
@require_GET
def galaxy_tools(request: HttpRequest) -> JsonResponse:
    try:
        galaxy_manager = GalaxyManager("")

        return JsonResponse({"tools": galaxy_manager.get_tools()})
    except Exception as e:
        return _create_galaxy_error(e, tools={})


@require_http_methods(["GET", "POST"])
def notification(request: HttpRequest) -> HttpResponse:
    notification_manager = NotificationManager()

    if request.method == "GET":
        return JsonResponse(notification_manager.get())

    if not request.user.is_authenticated or not is_admin(request.user):
        raise PermissionDenied

    try:
        data = json.loads(request.body.decode("utf-8"))
        notification_manager.set(data)
    except Exception:
        return HttpResponseBadRequest("message parameter is missing")

    return HttpResponse()


@require_GET
def client_proxy(request: HttpRequest) -> StreamingHttpResponse:
    """Proxy requests to the Vite dev server during development.

    This method is only available in DEBUG mode.
    """
    proxy_response = proxy_request(
        "GET",
        f"http://localhost:5173{request.path}",
        headers=request.headers,
        stream=True,
    )

    response = StreamingHttpResponse(proxy_response.raw)
    response["Content-Type"] = proxy_response.headers["Content-Type"]

    return response
