"""Tool-panel fixtures backing Galaxy's ``GET /api/tools?tool_help=true``.

``src/vue/src/assets/js/galaxy.js`` turns Galaxy's raw tool panel into the dashboard's
category structure, so these builders emit the *raw* Galaxy shape and let the real
client-side grouping run. The rules it applies (and which these fixtures exercise):

* a section id ending in ``-main`` names a "main" category; the suffix is stripped and
  the section supplies the category's display name and description
* a tool only appears if its id starts with ``VITE_TOOL_PREFIX`` ("nova"), equals
  ``VITE_TEST_TOOL_ID``, or is listed in ``VITE_EXTRA_TOOLS``
* a tool whose id contains "prototype" lands in ``prototype_tools``
* a category with no tools at all is dropped entirely
"""

from typing import Any, Dict, List

ToolPanel = List[Dict[str, Any]]


def tool(
    tool_id: str,
    name: str,
    help_text: str = "",
    version: str = "1.0.0",
    documentation: str = "",
) -> Dict[str, Any]:
    """Build one entry of a Galaxy tool-panel section."""
    return {
        "id": tool_id,
        "name": name,
        # The client runs this through a DOMParser and keeps only the first line.
        "help": help_text or f"<p>{name} description.</p>",
        "version": version,
        "documentation": documentation,
    }


def section(section_id: str, name: str, description: str, elems: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build one Galaxy tool-panel section."""
    return {"id": section_id, "name": name, "description": description, "elems": elems}


def default_panel() -> ToolPanel:
    """The tool panel most tests run against.

    Shaped to cover the RUN_SHEET's category cases in a single fixture:

    * ``imaging`` - an ordinary category with two tools, one of which has documentation
    * ``spectroscopy`` - a category whose only tool is a prototype, so the Category page
      renders a "Prototype Tools" section (3.3)
    * ``diffraction`` - a main category whose tools are all filtered out by the prefix
      rule, so it disappears from the dashboard entirely and leaves the "stay tuned"
      path reachable (3.2)
    * ``generic-tools`` - excluded from the home grid but shown in the Tools drawer (12.x)
    """
    return [
        section(
            "imaging-main",
            "Imaging",
            "Tools for imaging techniques.",
            [
                tool("nova_reconstruct", "Reconstruct", "<p>Reconstructs raw projections.</p>"),
                tool(
                    "nova_visualize",
                    "Visualize",
                    "<p>Visualizes reduced data.</p>",
                    documentation="http://nova.invalid/docs/visualize",
                ),
            ],
        ),
        section(
            "spectroscopy-main",
            "Spectroscopy",
            "Tools for spectroscopy techniques.",
            [tool("nova_prototype_fitter", "Prototype Fitter", "<p>Fits spectra.</p>")],
        ),
        section(
            "diffraction-main",
            "Diffraction",
            "Tools for diffraction techniques.",
            # Filtered out: the id matches neither the "nova" prefix nor VITE_EXTRA_TOOLS.
            [tool("unrelated_tool", "Unrelated Tool")],
        ),
        section(
            "generic-tools-main",
            "Generic Tools",
            "Tools that can be used by all techniques.",
            [tool("nova_notebook", "Notebook", "<p>Opens a notebook.</p>")],
        ),
        # Deliberately "generic-tools", not "generic-tools-main": a section id without the
        # -main suffix merges into the category of the same base name rather than defining
        # its own, which is how Galaxy keeps a category's prototype tools in a separate
        # section while the dashboard still groups them under one category.
        section(
            "generic-tools",
            "Generic Prototype Tools",
            "Prototype tools for all techniques.",
            [tool("nova_prototype_shell", "Prototype Shell", "<p>Opens a shell.</p>")],
        ),
    ]


def panel_without_generic_tools() -> ToolPanel:
    """A panel with no generic or prototype tools, so the Tools FAB is not rendered (12.2)."""
    return [
        section(
            "imaging-main",
            "Imaging",
            "Tools for imaging techniques.",
            [tool("nova_reconstruct", "Reconstruct", "<p>Reconstructs raw projections.</p>")],
        )
    ]


def panel_with_empty_category() -> ToolPanel:
    """A panel whose ``imaging`` category holds only prototype tools.

    The Category page then has no non-prototype tools to list and falls back to its
    "Stay tuned" message (3.2) while still rendering a Prototype Tools section.
    """
    return [
        section(
            "imaging-main",
            "Imaging",
            "Tools for imaging techniques.",
            [tool("nova_prototype_recon", "Prototype Reconstruct", "<p>Prototype.</p>")],
        )
    ]
