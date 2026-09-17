/**
 * Mocks POST /api/galaxy/launch|stop|monitor/ (src/vue/src/stores/job.js), which is the
 * stateful heart of the tool launch/stop lifecycle (RUN_SHEET sections 4-6).
 *
 * The store polls monitor/ every 2s (job.js: `timeout: 2000`) - use page.clock (installed
 * in fixtures.js) to fast-forward virtual time instead of waiting on real timers, e.g.:
 *
 *   const jobs = createJobController()
 *   await mockJobs(page, jobs)
 *   ...
 *   jobs.setState(tool.id, { state: "running", url: "https://tool.invalid", url_ready: true })
 *   await page.clock.fastForward(2100)
 *   await expect(page.getByRole("link", { name: "Open" })).toBeVisible()
 *
 * Response shape matches GalaxyManager.monitor_jobs() (src/launcher_app/galaxy.py).
 */

let counter = 0

export function createJobController() {
    const jobs = new Map() // tool_id -> job record

    return {
        jobs,
        launch(tool_id, inputs) {
            const job_id = `job-${++counter}`
            const isDatafileTool = !!inputs && Object.keys(inputs).length > 0

            jobs.set(tool_id, {
                job_id,
                tool_id,
                state: "new",
                url: "",
                url_ready: false,
                is_datafile_tool: isDatafileTool,
                is_extra_tool: false,
                ...(isDatafileTool ? { parameters: inputs } : {})
            })

            return job_id
        },
        stop(job_id) {
            for (const [tool_id, job] of jobs) {
                if (job.job_id === job_id) {
                    jobs.delete(tool_id)
                }
            }
        },
        setState(tool_id, patch) {
            const job = jobs.get(tool_id)
            if (!job) {
                throw new Error(`No mocked job for tool_id "${tool_id}". Launch it first.`)
            }
            Object.assign(job, patch)
        },
        // Seeds a job as if it already existed before the page loaded (e.g. a job launched
        // in a previous session, or - with is_extra_tool: true - one launched outside the
        // dashboard entirely). Defaults to an externally-launched, already-running job.
        seedJob(tool_id, patch = {}) {
            const job_id = patch.job_id || `external-${++counter}`
            jobs.set(tool_id, {
                state: "running",
                url: "",
                url_ready: false,
                is_datafile_tool: false,
                is_extra_tool: true,
                ...patch,
                job_id,
                tool_id
            })
            return job_id
        },
        remove(tool_id) {
            jobs.delete(tool_id)
        },
        get(tool_id) {
            return jobs.get(tool_id)
        },
        list() {
            return [...jobs.values()]
        }
    }
}

export async function mockJobs(page, controller = createJobController()) {
    await page.route("**/api/galaxy/launch/", async (route) => {
        const body = route.request().postDataJSON()
        const job_id = controller.launch(body.tool_id, body.inputs)

        await route.fulfill({ json: { id: job_id } })
    })

    await page.route("**/api/galaxy/stop/", async (route) => {
        const body = route.request().postDataJSON()
        controller.stop(body.job_id)

        await route.fulfill({ status: 200, body: "" })
    })

    await page.route("**/api/galaxy/monitor/", async (route) => {
        await route.fulfill({ json: { jobs: controller.list() } })
    })

    return controller
}

export async function mockLaunchFailure(page, message = "Tool failed to launch.") {
    await page.route("**/api/galaxy/launch/", async (route) => {
        await route.fulfill({ status: 500, json: { error: message } })
    })
}
