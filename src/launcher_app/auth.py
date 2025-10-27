"""Defines a class for interacting with our OAuth providers.

The OAuth providers must be configured via your .env file. See
.env.sample for the available configuration options.
"""

from typing import Any

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.http import HttpRequest
from django.utils.crypto import get_random_string
from jwt import decode
from requests import get as requests_get
from requests.auth import HTTPBasicAuth
from requests_oauthlib import OAuth2Session

from .models import OAuthSessionState


class AuthManager:
    """Class to manage Authentication for the Dashboard."""

    def __init__(self, request: HttpRequest):
        """Init."""
        if request.user.is_authenticated:
            self.oauth_state = OAuthSessionState.objects.get(user=request.user)
        else:
            try:
                self.oauth_state = OAuthSessionState.objects.get(state_param=request.GET["state"])
            except (KeyError, OAuthSessionState.DoesNotExist):
                self.oauth_state = OAuthSessionState.objects.create(state_param=self.create_state_param())

        self.sessions = {}
        for provider_id, provider in settings.OAUTH_PROVIDERS.items():
            self.sessions[provider_id] = OAuth2Session(
                provider["client_id"],
                auto_refresh_url=provider["token_url"],
                redirect_uri=f"{settings.BASE_URL}/{provider['redirect_path']}",
                scope=provider["scopes"].split(" "),
                token_updater=self.save_access_token,
            )

    def create_state_param(self) -> str:
        return get_random_string(length=128)

    def delete_galaxy_api_key(self) -> None:
        self.oauth_state.galaxy_api_key = ""
        self.oauth_state.save()

    def login(self, request: HttpRequest, email: str, given_name: str) -> None:
        try:
            user = get_user_model().objects.get(username=email)
        except get_user_model().DoesNotExist:
            user = get_user_model().objects.create_user(username=email, email=email, first_name=given_name)  # type: ignore

        login(request, user)

        # Removing old session states both reduces the size of the database over
        # time and allows us to make OAuthSessionState.user a OneToOneField.
        OAuthSessionState.objects.filter(user=user).delete()

        self.oauth_state.user = user
        self.oauth_state.save()

    def redirect_handler(self, request: HttpRequest, session_type: str) -> dict[str, Any]:
        self.oauth_state.session_type = session_type
        self.oauth_state.save()

        tokens = self.sessions[session_type].fetch_token(
            settings.OAUTH_PROVIDERS[session_type]["token_url"],
            authorization_response=request.build_absolute_uri(),
            client_secret=settings.OAUTH_PROVIDERS[session_type]["client_secret"],
        )

        self.save_access_token(tokens["access_token"])
        self.save_refresh_token(tokens["refresh_token"])

        return decode(tokens["id_token"], options={"verify_signature": False})

    def get_galaxy_api_key(self) -> str:
        if self.oauth_state.galaxy_api_key == "":
            access_token = self.get_access_token()
            response = requests_get(
                f"{settings.GALAXY_URL}{settings.GALAXY_API_KEY_ENDPOINT}",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            data = response.json()
            if "err_msg" in data:
                if data["err_msg"].startswith("Cannot locate user by access token."):
                    data["err_msg"] = (
                        f"Please login to {settings.GALAXY_URL} once with {self.oauth_state.session_type.upper()} "
                        "before using this dashboard."
                    )
                raise Exception(data["err_msg"])

            self.oauth_state.galaxy_api_key = response.json()["api_key"]
            self.oauth_state.save()

        return self.oauth_state.galaxy_api_key

    def get_access_token(self) -> str:
        session_type = self.oauth_state.session_type
        tokens = self.sessions[session_type].refresh_token(
            settings.OAUTH_PROVIDERS[session_type]["token_url"],
            auth=HTTPBasicAuth(
                settings.OAUTH_PROVIDERS[session_type]["client_id"],
                settings.OAUTH_PROVIDERS[session_type]["client_secret"],
            ),
            refresh_token=self.get_refresh_token(),
        )

        self.save_access_token(tokens["access_token"])
        self.save_refresh_token(tokens["refresh_token"])

        return self.oauth_state.access_token

    def get_refresh_token(self) -> str:
        return Fernet(settings.REFRESH_TOKEN_KEY).decrypt(self.oauth_state.refresh_token.encode()).decode()

    def get_auth_url(self, session_type: str) -> str:
        return self.sessions[session_type].authorization_url(settings.OAUTH_PROVIDERS[session_type]["auth_url"])[0]

    def save_access_token(self, token: str) -> None:
        self.oauth_state.access_token = token
        self.oauth_state.save()

    def save_refresh_token(self, token: str) -> None:
        self.oauth_state.refresh_token = Fernet(settings.REFRESH_TOKEN_KEY).encrypt(token.encode()).decode()
        self.oauth_state.save()
