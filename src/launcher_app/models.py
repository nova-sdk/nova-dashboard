"""Custom model for making OAuth requests.

This model tracks important state so that we don't need to track this state
in memory. Doing so in memory makes the server stateful and makes it difficult
to run multiple server workers.
"""

from django.db import models


class Notification(models.Model):
    """Stores a notification broadcast to all users."""

    display: models.BooleanField = models.BooleanField(blank=True, default=False)
    message: models.CharField = models.CharField(max_length=255, blank=True)
