"""Defines a class for interacting GitLab to create issues."""

from typing import Any, Dict

from django.conf import settings
from requests import post


class IssueManager:
    """Class to create GitLab issues."""

    def submit(self, data: Dict[str, Any]) -> str:
        response = post(
            settings.GITLAB_ISSUES_API_ENDPOINT,
            headers={"PRIVATE-TOKEN": settings.GITLAB_ACCESS_TOKEN},
            json={
                "description": f"""# Reported By

{data["email"]} {data["name"]}

# Mode of Contact

Issue submission form

# Issue Description

{data["description"]}

# Internal Issue Links""",
                "title": f"{data['subject']}",
            },
        )
        result = response.json()

        return result["web_url"]
