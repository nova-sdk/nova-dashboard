/**
 * Direct-to-Galaxy client, bypassing the Django `/api/galaxy/*` proxy.
 *
 * PROTOTYPE — built to answer "what would it take to run NOVA as a Galaxy
 * subdomain and talk to Galaxy directly?". It assumes the browser already
 * carries a valid Galaxy session cookie (i.e. NOVA is served from the same
 * site/origin as Galaxy, or a CORS+cookie-sharing setup has been configured
 * on the Galaxy side), so every call below uses `credentials: "include"`
 * instead of the per-request `api_key` the Django backend used.
 *
 * Known gap: Galaxy's own frontend attaches a `session-csrf-token` header
 * (read from its bootstrapped page config) to session-cookie-authenticated
 * POST/PUT/DELETE calls, to stop CSRF on those endpoints. This module reads
 * it from `window.Galaxy?.session_csrf_token` as a best guess — this needs
 * to be verified against the actual deployed Galaxy version before this can
 * do anything beyond read-only calls; GET requests are unaffected.
 */

const galaxyUrl = import.meta.env.VITE_GALAXY_URL

export const NONTERMINAL_STATES = [
    "deleted_new",
    "failed",
    "new",
    "paused",
    "queued",
    "resubmitted",
    "running",
    "upload",
    "waiting"
]
export const TERMINAL_STATES = ["deleted", "deleting", "error", "ok"]
export const RUNNING_STATES = ["running"]

export class GalaxyApiError extends Error {
    constructor(response, body) {
        super(`Galaxy API request to ${response.url} failed with ${response.status}`)
        this.status = response.status
        this.body = body
    }
}

export class DatafileRegistrationError extends Error {
    constructor(key) {
        super(
            `File for parameter '${key}' failed to register to Galaxy. ` +
                "The filepath is likely malformed or nonexistent."
        )
    }
}

function sessionCsrfToken() {
    // See the module docstring above - unverified against a live Galaxy instance.
    return window.Galaxy?.session_csrf_token ?? ""
}

async function galaxyApi(path, options = {}) {
    const response = await fetch(`${galaxyUrl}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "session-csrf-token": sessionCsrfToken(),
            ...(options.headers || {})
        }
    })

    if (!response.ok) {
        let body = null
        try {
            body = await response.json()
        } catch {
            // Response wasn't JSON; leave body null.
        }
        throw new GalaxyApiError(response, body)
    }

    return response
}

// Tool filtering config, exposed to the front-end via envPrefix in vite.config.js.
const toolPrefix = import.meta.env.TOOL_PREFIX || "nova"
const testToolId = import.meta.env.TEST_TOOL_ID || ""
const extraTools = (import.meta.env.EXTRA_TOOLS || "").split(",")

function parseToolHelp(toolHelp) {
    const text = new DOMParser().parseFromString(toolHelp, "text/html").body.textContent || ""

    // Grab only the first line of the help text.
    return text.trim().split("\n")[0].trim()
}

/**
 * Client-side port of the removed Django GalaxyManager.get_tools: fetches the
 * tool panel from GET /api/tools?tool_help=true and groups the dashboard's tools
 * by category. Returns the same shape the old `/api/galaxy/tools/` view did.
 */
export async function getTools() {
    const galaxyTools = await (await galaxyApi("/api/tools?tool_help=true")).json()
    const toolJson = {}
    const mainCategories = []

    for (const galaxyCategory of galaxyTools) {
        let categoryId = galaxyCategory.id ?? "generic-tools-main"

        // Galaxy doesn't behave well if a non-prototype and prototype section/category have the same ID, so the
        // notion of a main category allows them to have separate IDs in Galaxy while being grouped here.
        const isMainCategory = categoryId.endsWith("-main")
        if (isMainCategory) {
            categoryId = categoryId.slice(0, -5)
            mainCategories.push(categoryId)
        }

        if (!(categoryId in toolJson)) {
            toolJson[categoryId] = {
                fallback_name: "",
                name: "",
                description: "",
                tools: [],
                prototype_tools: []
            }
        }

        const category = toolJson[categoryId]
        if (isMainCategory) {
            category.name = galaxyCategory.name ?? ""
            category.description = galaxyCategory.description ?? ""
        }
        category.fallback_name = categoryId

        for (const tool of galaxyCategory.elems ?? []) {
            const toolId = tool.id.trim()
            if (
                !toolId.startsWith(toolPrefix) &&
                toolId !== testToolId &&
                !extraTools.includes(toolId)
            ) {
                continue
            }

            const toolData = {
                id: toolId,
                description: parseToolHelp(tool.help ?? ""),
                name: tool.name ?? "Unnamed Tool",
                version: tool.version ?? "unversioned",
                documentation: tool.documentation ?? ""
            }
            if (toolId.includes("prototype")) {
                category.prototype_tools.push(toolData)
            } else {
                category.tools.push(toolData)
            }
        }
    }

    // Galaxy returns the sections in a deterministic, but somewhat arbitrary order. This forces all of our main
    // categories to appear first in alphabetical order.
    mainCategories.sort()
    const orderedIds = [
        ...mainCategories,
        ...Object.keys(toolJson).filter((id) => !mainCategories.includes(id))
    ]

    // If a category has no tools (this is common for prototype categories with no NOVA tools), then we hide it.
    const orderedJson = {}
    for (const categoryId of orderedIds) {
        const category = toolJson[categoryId]
        if (!category.tools.length && !category.prototype_tools.length) {
            continue
        }
        if (!category.name) {
            category.name = category.fallback_name
                .replaceAll("-", " ")
                .replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
        }
        orderedJson[categoryId] = category
    }

    return orderedJson
}

const historyIdCache = new Map()

/** Resolves a Galaxy history's id by name, mirroring nova.galaxy's Datastore lookup. */
export async function getHistoryId(name, { create = true } = {}) {
    if (historyIdCache.has(name)) {
        return historyIdCache.get(name)
    }

    const histories = await (await galaxyApi("/api/histories")).json()
    const existing = histories.find((history) => history.name === name)
    if (existing) {
        historyIdCache.set(name, existing.id)
        return existing.id
    }

    if (!create) {
        return null
    }

    const created = await (
        await galaxyApi("/api/histories", { method: "POST", body: JSON.stringify({ name }) })
    ).json()
    historyIdCache.set(name, created.id)
    return created.id
}

/** Launches a tool, mirroring bioblend's tools.run_tool -> POST /api/tools. */
export async function runTool(historyId, toolId, inputs) {
    const response = await galaxyApi("/api/tools", {
        method: "POST",
        body: JSON.stringify({
            history_id: historyId,
            tool_id: toolId,
            input_format: "legacy",
            inputs: inputs || {}
        })
    })
    return await response.json()
}

const REGISTER_TOOL_ID = "neutrons_register"

/** Polls a job until it reaches a terminal state, mirroring bioblend's jobs.wait_for_job. */
async function waitForJob(jobId, intervalMs = 1000) {
    for (;;) {
        const { state } = await showJob(jobId)
        if (TERMINAL_STATES.includes(state)) {
            return state
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
}

/**
 * Registers a file path from the instrument filesystem as a Galaxy dataset, mirroring the removed Django
 * GalaxyManager.ingest_file. The path is read by the neutrons_register tool on the Galaxy side, so the browser
 * never needs access to it. Returns the new dataset's id, or null if registration failed.
 */
export async function ingestFile(historyName, filePath) {
    const historyId = await getHistoryId(`${historyName}_data`)
    const results = await runTool(historyId, REGISTER_TOOL_ID, { "series_0|input": filePath })
    const state = await waitForJob(results.jobs[0].id)

    return state === "ok" ? (results.outputs[0]?.id ?? null) : null
}

/**
 * Launches a tool, mirroring the removed Django GalaxyManager.launch_job: tools with inputs run in the
 * datafile tools history, and any `file_` inputs are ingested first and passed to the tool as datasets.
 * Returns the new job's id.
 */
export async function launchTool(historyName, toolId, inputs = {}) {
    const hasInputs = Object.keys(inputs).length > 0
    const historyId = await getHistoryId(hasInputs ? `${historyName}_datafile_tools` : historyName)

    const toolInputs = {}
    for (const [key, value] of Object.entries(inputs)) {
        if (key.startsWith("file_")) {
            const id = await ingestFile(historyName, value)
            if (id === null) {
                throw new DatafileRegistrationError(key)
            }
            toolInputs[key] = { src: "hda", id }
        } else {
            toolInputs[key] = value
        }
    }

    // This allows us to test the error monitoring at will on the test instance
    if (toolId === testToolId) {
        toolInputs["command_mode|command"] = "fail"
    }

    const results = await runTool(historyId, toolId, toolInputs)
    return results.jobs[0].id
}

/** Cancels a job outright, mirroring bioblend's jobs.cancel_job -> DELETE /api/jobs/{id}. */
export async function cancelJob(jobId) {
    try {
        await galaxyApi(`/api/jobs/${jobId}`, { method: "DELETE" })
        return true
    } catch {
        return false
    }
}

/** Lists jobs, mirroring bioblend's jobs.get_jobs -> GET /api/jobs. */
export async function getJobs({ historyId, state, limit, orderBy } = {}) {
    const params = new URLSearchParams()
    if (historyId) params.set("history_id", historyId)
    if (limit) params.set("limit", limit)
    if (orderBy) params.set("order_by", orderBy)
    for (const s of state ? (Array.isArray(state) ? state : [state]) : []) {
        params.append("state", s)
    }

    const response = await galaxyApi(`/api/jobs?${params.toString()}`)
    return await response.json()
}

/** Full job details (stderr, params), mirroring bioblend's jobs.show_job -> GET /api/jobs/{id}?full=true. */
export async function showJob(jobId, { full = false } = {}) {
    const response = await galaxyApi(`/api/jobs/${jobId}${full ? "?full=true" : ""}`)
    return await response.json()
}

/** Interactive tool entry points for a job -> GET /api/entry_points?job_id=. */
export async function getEntryPoints(jobId) {
    const response = await galaxyApi(`/api/entry_points?job_id=${jobId}`)
    return await response.json()
}

/**
 * Probes whether an interactive tool's proxied URL is actually serving the
 * tool yet, replicating the body-sniffing check the removed Django
 * `GalaxyManager.monitor_jobs` used to do server-side (Galaxy's proxy returns 200 with a placeholder page
 * before the tool container is really ready).
 */
export async function probeToolUrl(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 100)
    try {
        const response = await fetch(url, { credentials: "include", signal: controller.signal })
        const text = await response.text()
        const ready =
            response.status === 200 &&
            !text.includes("Proxy target missing") &&
            !text.includes("Javascript Required for Galaxy")
        console.debug(`[galaxy probe] ${url} -> ${response.status}, ready: ${ready}`)
        return ready
    } catch (error) {
        // An AbortError means the 100ms budget ran out; a TypeError is usually a
        // network or CORS failure (e.g. the tool is served from another origin).
        console.debug(`[galaxy probe] ${url} -> ${error.name}: ${error.message}`)
        return false
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Client-side port of the removed Django GalaxyManager.monitor_jobs:
 * aggregates the dashboard's own non-terminal jobs, datafile-tool jobs, "extra"
 * jobs the dashboard didn't launch, and recently-known terminal jobs, then
 * resolves each one's interactive-tool URL/readiness. Returns the same shape
 * the old `/api/galaxy/monitor/` Django view did, so the Pinia store's existing
 * diffing logic (job.js) can stay untouched.
 */
export async function fetchJobStatus(historyName, toolIds) {
    const dashboardHistoryId = await getHistoryId(historyName, { create: false })
    if (!dashboardHistoryId) {
        return { jobs: [] }
    }
    const datafileHistoryId = await getHistoryId(`${historyName}_datafile_tools`, { create: false })

    const [dashboardJobs, datafileJobs, runningJobs, dashboardTerminal, datafileTerminal] =
        await Promise.all([
            getJobs({ historyId: dashboardHistoryId, state: NONTERMINAL_STATES }),
            datafileHistoryId
                ? getJobs({ historyId: datafileHistoryId, state: NONTERMINAL_STATES })
                : [],
            getJobs({ state: RUNNING_STATES }),
            getJobs({
                historyId: dashboardHistoryId,
                limit: 5,
                orderBy: "create_time",
                state: TERMINAL_STATES
            }),
            datafileHistoryId
                ? getJobs({
                      historyId: datafileHistoryId,
                      limit: 5,
                      orderBy: "create_time",
                      state: TERMINAL_STATES
                  })
                : []
        ])

    const dashboardJobIds = new Set(dashboardJobs.map((job) => job.id))
    const datafileJobIds = new Set(datafileJobs.map((job) => job.id))
    const extraJobs = runningJobs.filter(
        (job) => !dashboardJobIds.has(job.id) && !datafileJobIds.has(job.id)
    )

    const allJobs = [...dashboardJobs]

    // Only surface a terminal job if the dashboard already knows about it (e.g.
    // it's the current job for one of the open tool panels) - otherwise a page
    // refresh after a job failed would keep re-surfacing the old error forever.
    const knownJobIds = new Set(Object.values(toolIds))
    for (const job of [...dashboardTerminal, ...datafileTerminal]) {
        if (knownJobIds.has(job.id)) {
            allJobs.push(job)
        }
    }
    for (const job of datafileJobs) {
        allJobs.push({ ...job, is_datafile_tool: true })
    }
    for (const job of extraJobs) {
        allJobs.push({ ...job, is_extra_tool: true })
    }

    // Unlike the old Django monitor_jobs, a failed per-job lookup is not skipped:
    // it fails the whole status fetch so the caller surfaces the error.
    const statusList = []
    for (const job of allJobs) {
        const state = job.state
        if (state === "deleted") {
            continue
        }

        let url = ""
        let ready = false
        if (state !== "error") {
            const entryPoints = await getEntryPoints(job.id)
            const entryPoint = entryPoints.find((ep) => ep.job_id === job.id && ep.target)
            if (entryPoint) {
                url = `${galaxyUrl}${entryPoint.target}`
                ready = await probeToolUrl(url)
            }
        }

        const data = {
            is_datafile_tool: job.is_datafile_tool || false,
            is_extra_tool: job.is_extra_tool || false,
            job_id: job.id,
            tool_id: job.tool_id,
            state,
            url,
            url_ready: ready
        }

        if (data.is_datafile_tool) {
            const full = await showJob(job.id)
            const parameters = { ...(full.params || {}) }
            delete parameters.chromInfo
            delete parameters.dbkey
            delete parameters.__input_ext
            data.parameters = parameters
        }

        if (state === "error") {
            const full = await showJob(job.id, { full: true })
            data.error = (full.stderr || "").slice(0, 500)
        }

        statusList.push(data)
    }

    return { jobs: statusList }
}

/**
 * Opens Galaxy's native SSE stream (Galaxy 26.1+, requires the admin flag
 * `enable_sse_updates: true` on the Galaxy side - see docs.galaxyproject.org
 * /en/latest/admin/sse_updates.html). It only fires `history_update` when a
 * history/HDA/HDCA row changes and `entry_point_update` when an interactive
 * tool's entry point becomes ready, so state changes of jobs without output
 * datasets need a poll (see schedulePoll in stores/job.js). Callers must
 * surface `onError` to the user.
 * The browser retries transient drops itself (readyState CONNECTING, then
 * `open` again); a non-retryable failure such as a 404 when SSE is disabled
 * leaves readyState CLOSED.
 */
export function openEventStream({ onEntryPointUpdate, onHistoryUpdate, onOpen, onError } = {}) {
    const source = new EventSource(`${galaxyUrl}/api/events/stream`, { withCredentials: true })

    // Debug logging for the dev scream test - visible under the console's "Verbose" level.
    source.addEventListener("open", () => console.debug("[galaxy sse] open"))
    for (const type of ["entry_point_update", "history_update", "message"]) {
        source.addEventListener(type, (event) => console.debug(`[galaxy sse] ${type}`, event.data))
    }
    source.addEventListener("error", () =>
        console.debug(
            `[galaxy sse] error (readyState: ${["CONNECTING", "OPEN", "CLOSED"][source.readyState]})`
        )
    )

    if (onOpen) source.addEventListener("open", onOpen)
    if (onEntryPointUpdate) {
        source.addEventListener("entry_point_update", (event) =>
            onEntryPointUpdate(JSON.parse(event.data))
        )
    }
    if (onHistoryUpdate) {
        source.addEventListener("history_update", (event) =>
            onHistoryUpdate(JSON.parse(event.data))
        )
    }
    if (onError) source.addEventListener("error", onError)

    return source
}
