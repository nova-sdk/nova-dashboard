"""Custom model for making OAuth requests.

This model tracks important state so that we don't need to track this state
in memory. Doing so in memory makes the server stateful and makes it difficult
to run multiple server workers.
"""

from django.contrib.auth import get_user_model
from django.db import models


class Notification(models.Model):
    """Stores a notification broadcast to all users."""

    display: models.BooleanField = models.BooleanField(blank=True, default=False)
    message: models.CharField = models.CharField(max_length=255, blank=True)


class OAuthSessionState(models.Model):
    """Keeps track of OAuth session state.

    Used in case the redirect worker is
    different from the worker that generated the redirect URL. Also tracks
    the user that logged in via this session so we can keep their access_token
    alive for as long as possible.
    """

    user = models.OneToOneField(get_user_model(), blank=True, null=True, on_delete=models.CASCADE)  # type: ignore
    access_token = models.CharField(max_length=255, blank=True)  # type: ignore
    create_time = models.DateTimeField(auto_now_add=True)  # type: ignore
    galaxy_api_key = models.CharField(max_length=128, blank=True)  # type: ignore
    refresh_token = models.CharField(max_length=255, blank=True)  # type: ignore
    # which OAuth provider is being used
    session_type = models.CharField(max_length=32, blank=True)  # type: ignore
    state_param = models.CharField(max_length=128, blank=True)  # type: ignore
