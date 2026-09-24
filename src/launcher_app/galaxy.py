"""Defines a class for checking a user's permissions on a specified Galaxy server.

The server to connect to can be controlled via the GALAXY_URL setting.
"""

from django.conf import settings
from nova.galaxy import Connection


class GalaxyManager:
    """Checks the Galaxy permissions of the user owning an API key."""

    def __init__(self, api_key: str):
        """Init."""
        if api_key:
            self.connection = Connection(settings.GALAXY_URL, api_key)

    def is_admin(self) -> bool:
        try:
            with self.connection.connect() as connection:
                return connection.galaxy_instance.users.get_current_user()["is_admin"]
        except Exception:
            return False

    def is_logged_in(self) -> bool:
        try:
            with self.connection.connect() as connection:
                connection.galaxy_instance.users.get_current_user()
                return True
        except Exception:
            return False
