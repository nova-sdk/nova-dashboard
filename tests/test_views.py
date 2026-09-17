"""Unit tests for launcher_app Django views.

Every view here delegates to a manager class (GalaxyManager, StatusManager, IssueManager,
NotificationManager) or proxies to an external service, so these tests mock those
collaborators and assert on request handling, response shape, and error translation rather
than exercising real Galaxy/GitLab/Prometheus/database calls.
"""

import json
from io import BytesIO
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings
from django.http import StreamingHttpResponse
from django.test import Client, RequestFactory
from requests import ConnectionError as RequestsConnectionError

from src.launcher_app import views


@pytest.fixture
def client() -> Client:
    return Client()


def _post_json(client: Client, url: str, payload: Dict[str, Any]) -> Any:
    return client.post(url, data=json.dumps(payload), content_type="application/json")


# get_vuetify_config


def test_get_vuetify_config_returns_theme_json(client: Client) -> None:
    response = client.get("/api/vuetify_config/")

    assert response.status_code == 200
    body = json.loads(response.content)
    assert "defaults" in body
    assert "theme" in body


def test_get_vuetify_config_sets_csrf_cookie(client: Client) -> None:
    response = client.get("/api/vuetify_config/")

    assert "csrftoken" in response.cookies


def test_get_vuetify_config_rejects_non_get(client: Client) -> None:
    response = client.post("/api/vuetify_config/")

    assert response.status_code == 405


# get_alerts


def test_get_alerts_returns_processed_alerts(client: Client) -> None:
    with patch("src.launcher_app.views.StatusManager") as mock_status_manager_cls:
        mock_status_manager_cls.return_value.get_alerts.return_value = [{"title": "disk full"}]

        response = client.get("/api/status/alerts/")

    assert response.status_code == 200
    assert json.loads(response.content) == {"alerts": [{"title": "disk full"}]}


def test_get_alerts_rejects_non_get(client: Client) -> None:
    response = client.post("/api/status/alerts/")

    assert response.status_code == 405


# get_targets


def test_get_targets_returns_processed_targets(client: Client) -> None:
    with patch("src.launcher_app.views.StatusManager") as mock_status_manager_cls:
        mock_status_manager_cls.return_value.get_targets.return_value = [{"alias": "bl-1"}]

        response = client.get("/api/status/targets/")

    assert response.status_code == 200
    assert json.loads(response.content) == [{"alias": "bl-1"}]


def test_get_targets_rejects_non_get(client: Client) -> None:
    response = client.post("/api/status/targets/")

    assert response.status_code == 405


# galaxy_is_admin


def test_galaxy_is_admin_true(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.is_admin.return_value = True

        response = _post_json(client, "/api/galaxy/is_admin/", {"api_key": "abc"})

    mock_galaxy_manager_cls.assert_called_once_with("abc")
    assert response.status_code == 200
    assert json.loads(response.content) == {"is_admin": True}


def test_galaxy_is_admin_false(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.is_admin.return_value = False

        response = _post_json(client, "/api/galaxy/is_admin/", {"api_key": "abc"})

    assert json.loads(response.content) == {"is_admin": False}


def test_galaxy_is_admin_reports_connection_error(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.is_admin.side_effect = RequestsConnectionError("boom")

        response = _post_json(client, "/api/galaxy/is_admin/", {"api_key": "abc"})

    assert response.status_code == 500
    body = json.loads(response.content)
    assert body["error"] == f"Unable to connect to Galaxy, {settings.GALAXY_URL} may be restarting."


def test_galaxy_is_admin_rejects_non_post(client: Client) -> None:
    response = client.get("/api/galaxy/is_admin/")

    assert response.status_code == 405


# galaxy_launch


def test_galaxy_launch_success(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.launch_job.return_value = "job-123"

        response = _post_json(client, "/api/galaxy/launch/", {"api_key": "abc", "tool_id": "nova_tool", "inputs": {}})

    mock_galaxy_manager_cls.return_value.launch_job.assert_called_once_with("nova_tool", {})
    assert response.status_code == 200
    assert json.loads(response.content) == {"id": "job-123"}


def test_galaxy_launch_reports_manager_error(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.launch_job.side_effect = ValueError("bad input file")

        response = _post_json(client, "/api/galaxy/launch/", {"api_key": "abc", "tool_id": "nova_tool"})

    assert response.status_code == 500
    assert json.loads(response.content) == {"error": "bad input file"}


def test_galaxy_launch_reports_malformed_body_as_restarting(client: Client) -> None:
    response = client.post("/api/galaxy/launch/", data="not-json", content_type="application/json")

    assert response.status_code == 500
    body = json.loads(response.content)
    assert body["error"] == f"Unable to fetch tool list, {settings.GALAXY_URL} may be restarting."


def test_galaxy_launch_rejects_non_post(client: Client) -> None:
    response = client.get("/api/galaxy/launch/")

    assert response.status_code == 405


# galaxy_monitor


def test_galaxy_monitor_success(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.monitor_jobs.return_value = [{"job_id": "job-123", "state": "running"}]

        response = _post_json(client, "/api/galaxy/monitor/", {"api_key": "abc", "tool_ids": {"nova_tool": "job-123"}})

    mock_galaxy_manager_cls.return_value.monitor_jobs.assert_called_once_with({"nova_tool": "job-123"})
    assert response.status_code == 200
    assert json.loads(response.content) == {"jobs": [{"job_id": "job-123", "state": "running"}]}


def test_galaxy_monitor_requires_tool_ids(client: Client) -> None:
    response = _post_json(client, "/api/galaxy/monitor/", {"api_key": "abc"})

    assert response.status_code == 500
    assert json.loads(response.content) == {"error": "'tool_ids'"}


def test_galaxy_monitor_rejects_non_post(client: Client) -> None:
    response = client.get("/api/galaxy/monitor/")

    assert response.status_code == 405


# galaxy_stop


def test_galaxy_stop_success(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        response = _post_json(client, "/api/galaxy/stop/", {"api_key": "abc", "job_id": "job-123"})

    mock_galaxy_manager_cls.return_value.stop_job.assert_called_once_with("job-123")
    assert response.status_code == 200
    assert response.content == b""


def test_galaxy_stop_reports_manager_error(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.stop_job.side_effect = Exception("job not found")

        response = _post_json(client, "/api/galaxy/stop/", {"api_key": "abc", "job_id": "job-123"})

    assert response.status_code == 500
    assert json.loads(response.content) == {"error": "job not found"}


def test_galaxy_stop_rejects_non_post(client: Client) -> None:
    response = client.get("/api/galaxy/stop/")

    assert response.status_code == 405


# galaxy_tools


def test_galaxy_tools_success(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.get_tools.return_value = {"reduction": {"tools": []}}

        response = client.get("/api/galaxy/tools/")

    mock_galaxy_manager_cls.assert_called_once_with("")
    assert response.status_code == 200
    assert json.loads(response.content) == {"tools": {"reduction": {"tools": []}}}


def test_galaxy_tools_reports_error_with_empty_tools(client: Client) -> None:
    with patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls:
        mock_galaxy_manager_cls.return_value.get_tools.side_effect = Exception("502 Bad Gateway")

        response = client.get("/api/galaxy/tools/")

    assert response.status_code == 500
    body = json.loads(response.content)
    assert body["error"] == f"Unable to connect to Galaxy, {settings.GALAXY_URL} may be restarting."
    assert body["tools"] == {}


def test_galaxy_tools_rejects_non_get(client: Client) -> None:
    response = client.post("/api/galaxy/tools/")

    assert response.status_code == 405


# report_issue


def test_report_issue_success(client: Client) -> None:
    with (
        patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls,
        patch("src.launcher_app.views.IssueManager") as mock_issue_manager_cls,
    ):
        mock_galaxy_manager_cls.return_value.is_logged_in.return_value = True
        mock_issue_manager_cls.return_value.submit.return_value = "https://code.ornl.gov/issue/1"

        response = _post_json(
            client,
            "/api/issue/",
            {"api_key": "abc", "email": "user@ornl.gov", "topic": "bug", "description": "it broke"},
        )

    assert response.status_code == 200
    assert json.loads(response.content) == {"url": "https://code.ornl.gov/issue/1"}


def test_report_issue_requires_login(client: Client) -> None:
    with (
        patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls,
        patch("src.launcher_app.views.IssueManager") as mock_issue_manager_cls,
    ):
        mock_galaxy_manager_cls.return_value.is_logged_in.return_value = False

        response = _post_json(client, "/api/issue/", {"api_key": "abc"})

    mock_issue_manager_cls.return_value.submit.assert_not_called()
    assert response.status_code == 400
    assert response.content == b"unable to process request"


def test_report_issue_rejects_malformed_body(client: Client) -> None:
    response = client.post("/api/issue/", data="not-json", content_type="application/json")

    assert response.status_code == 400
    assert response.content == b"unable to process request"


def test_report_issue_rejects_non_post(client: Client) -> None:
    response = client.get("/api/issue/")

    assert response.status_code == 405


# notification


def test_notification_get_returns_current_notification(client: Client) -> None:
    with patch("src.launcher_app.views.NotificationManager") as mock_notification_manager_cls:
        mock_notification_manager_cls.return_value.get.return_value = {"display": True, "message": "down for maint"}

        response = client.get("/api/notification/")

    assert response.status_code == 200
    assert json.loads(response.content) == {"display": True, "message": "down for maint"}


def test_notification_post_success_for_admin(client: Client) -> None:
    with (
        patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls,
        patch("src.launcher_app.views.NotificationManager") as mock_notification_manager_cls,
    ):
        mock_galaxy_manager_cls.return_value.is_admin.return_value = True

        response = _post_json(client, "/api/notification/", {"api_key": "abc", "display": True, "message": "hi"})

    mock_notification_manager_cls.return_value.set.assert_called_once_with(
        {"api_key": "abc", "display": True, "message": "hi"}
    )
    assert response.status_code == 200
    assert response.content == b""


def test_notification_post_requires_admin(client: Client) -> None:
    with (
        patch("src.launcher_app.views.GalaxyManager") as mock_galaxy_manager_cls,
        patch("src.launcher_app.views.NotificationManager") as mock_notification_manager_cls,
    ):
        mock_galaxy_manager_cls.return_value.is_admin.return_value = False

        response = _post_json(client, "/api/notification/", {"api_key": "abc", "message": "hi"})

    mock_notification_manager_cls.return_value.set.assert_not_called()
    assert response.status_code == 400
    assert response.content == b"message parameter is missing"


def test_notification_post_rejects_malformed_body(client: Client) -> None:
    response = client.post("/api/notification/", data="not-json", content_type="application/json")

    assert response.status_code == 400
    assert response.content == b"message parameter is missing"


def test_notification_rejects_put(client: Client) -> None:
    response = client.put("/api/notification/")

    assert response.status_code == 405


# client_proxy


def test_client_proxy_streams_vite_dev_server_response() -> None:
    factory = RequestFactory()
    request = factory.get("/some/asset.js")

    fake_upstream_response = MagicMock()
    fake_upstream_response.headers = {"Content-Type": "application/javascript"}
    fake_upstream_response.raw = BytesIO(b"console.log('hi')")

    with patch("src.launcher_app.views.proxy_request", return_value=fake_upstream_response) as mock_proxy_request:
        response = views.client_proxy(request)

    mock_proxy_request.assert_called_once_with(
        "GET",
        "http://localhost:5173/some/asset.js",
        headers=request.headers,
        stream=True,
    )
    assert isinstance(response, StreamingHttpResponse)
    assert response["Content-Type"] == "application/javascript"


def test_client_proxy_rejects_non_get() -> None:
    factory = RequestFactory()
    request = factory.post("/some/asset.js")

    response = views.client_proxy(request)

    assert response.status_code == 405
