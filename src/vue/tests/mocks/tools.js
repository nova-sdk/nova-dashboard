/**
 * Mocks GET /api/galaxy/tools/ (src/vue/src/router/index.js), which is fetched once before
 * the router/app are created and stored module-side (not reactive) - so each test must
 * register its tools mock before calling page.goto().
 *
 * Shape matches GalaxyManager.get_tools()'s ToolDict (src/launcher_app/galaxy.py):
 * { <category-id>: { fallback_name, name, description, tools: [...], prototype_tools: [...] } }
 */

export const IMAGING_TOOL = {
    id: "nova_reduce",
    name: "Reduce",
    description: "Reduces raw imaging data.",
    version: "1.0.0",
    documentation: ""
}

export const IMAGING_TOOL_WITH_DOCS = {
    id: "nova_visualize",
    name: "Visualize",
    description: "Visualizes reduced data.",
    version: "2.1.0",
    documentation: "https://docs.example.invalid/visualize"
}

export const SCATTERING_PROTOTYPE_TOOL = {
    id: "nova_prototype_scatter",
    name: "Prototype Scatter",
    description: "An experimental scattering tool.",
    version: "0.1.0",
    documentation: ""
}

export const GENERIC_TOOL = {
    id: "nova_generic_tool",
    name: "Generic Tool",
    description: "A tool usable across categories.",
    version: "1.0.0",
    documentation: ""
}

export const GENERIC_PROTOTYPE_TOOL = {
    id: "nova_prototype_generic",
    name: "Generic Prototype",
    description: "An experimental cross-technique tool.",
    version: "0.1.0",
    documentation: ""
}

export const DATAFILE_TOOL = {
    id: "nova_datafile_tool",
    name: "Datafile Tool",
    description: "Launched automatically from a data file.",
    version: "1.0.0",
    documentation: ""
}

export function defaultTools() {
    return {
        imaging: {
            fallback_name: "imaging",
            name: "Imaging",
            description: "Imaging techniques and tools.",
            tools: [IMAGING_TOOL, IMAGING_TOOL_WITH_DOCS, DATAFILE_TOOL],
            prototype_tools: []
        },
        scattering: {
            fallback_name: "scattering",
            name: "Scattering",
            description: "Scattering techniques and tools.",
            tools: [],
            prototype_tools: [SCATTERING_PROTOTYPE_TOOL]
        },
        "generic-tools": {
            fallback_name: "generic-tools",
            name: "Generic Tools",
            description: "Tools usable by any technique.",
            tools: [GENERIC_TOOL],
            prototype_tools: [GENERIC_PROTOTYPE_TOOL]
        }
    }
}

export async function mockTools(page, tools = defaultTools()) {
    await page.route("**/api/galaxy/tools/", async (route) => {
        await route.fulfill({ json: { tools } })
    })
}
