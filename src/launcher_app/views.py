"""Django views for the launcher app.

These views implement the URL schema
specified in urls.py file.
"""

import json
from importlib.resources import open_text

from django.core.exceptions import PermissionDenied
from django.http import HttpRequest, HttpResponse, HttpResponseBadRequest, JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from requests import request as proxy_request

from .galaxy import GalaxyManager
from .issue import IssueManager
from .status import StatusManager


@ensure_csrf_cookie
@require_GET
def get_vuetify_config(request: HttpRequest) -> JsonResponse:
    with open_text("nova.trame.view.theme.assets", "vuetify_config.json") as vuetify_config:
        return JsonResponse(json.load(vuetify_config))


@require_GET
def get_alerts(request: HttpRequest) -> JsonResponse:
    status_manager = StatusManager()

    alert_data = {"alerts": status_manager.get_alerts()}

    return JsonResponse(alert_data)


@require_GET
def get_targets(request: HttpRequest) -> JsonResponse:
    status_manager = StatusManager()

    return JsonResponse(status_manager.get_targets(), safe=False)


@require_POST
def report_issue(request: HttpRequest) -> HttpResponse:
    issue_manager = IssueManager()

    try:
        data = json.loads(request.body)
        galaxy_manager = GalaxyManager(data.get("api_key", ""))
        if not galaxy_manager.is_logged_in():
            raise PermissionDenied()
        url = issue_manager.submit(data)
    except Exception:
        return HttpResponseBadRequest("unable to process request")

    return JsonResponse({"url": url})


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
