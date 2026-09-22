import Cookies from "js-cookie"
import { defineStore } from "pinia"
import { nextTick } from "vue"

import {
    cancelJob,
    fetchJobStatus,
    GalaxyApiError,
    getHistoryId,
    openEventStream,
    runTool
} from "@/services/galaxyDirect"
import { useUserStore } from "@/stores/user"

const basePath = import.meta.env.VITE_BASE_PATH
const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const galaxyUrl = import.meta.env.VITE_GALAXY_URL
const galaxyHistoryName = import.meta.env.VITE_GALAXY_HISTORY_NAME || "launcher_history"

export const useJobStore = defineStore("job", {
    state: () => {
        return {
            user: useUserStore(),
            all_jobs: [],
            allow_autoopen: true,
            callback: null,
            failed_jobs: [],
            galaxy_error: "",
            static_error: false,
            has_monitored: false,
            is_monitoring: false,
            jobs: {},
            running: false,
            timeout: 2000,
            // Safety-net poll interval while relying on Galaxy's SSE stream - see
            // startMonitor(). Kept much slower than the old 2s poll since it's
            // now a fallback rather than the primary update mechanism.
            fallback_timeout: 20000,
            event_source: null,
            timeout_error: false,
            timeout_duration: 60000,
            error_reset_duration: 15000,
            monitor_interval: null,
            monitoring_autolaunch: false
        }
    },
    actions: {
        async handleError(response, timeout, tool_id) {
            let message = ""

            if (response.status === 403) {
                if (this.monitoring_autolaunch) {
                    return
                } else {
                    // The users login has expired and they must login to use the site. Refreshing makes it clear that they need to sign in without showing large error messages.
                    window.location.reload()
                }
            } else {
                try {
                    // Most of our views will return a JSON with a detailed error message.
                    const data = await response.json()
                    message = `${galaxyAlias} error: ${data.error}`
                } catch {
                    // If we don't get a JSON back, then we fallback to a generic error message.
                    message = `${galaxyAlias} failed to process your request. Please try again in a few minutes.`
                }
            }

            if (timeout) {
                this.showErrorWithTimeout(message, tool_id)
            } else {
                this.galaxy_error = message
            }
        },
        showErrorWithTimeout(message, tool_id) {
            this.timeout_error = true
            setTimeout(() => {
                if (tool_id !== undefined) {
                    delete this.jobs[tool_id]
                }
                this.timeout_error = false
            }, this.error_reset_duration)

            this.galaxy_error = message
        },
        async galaxyFetch(endpoint, options) {
            await this.user.getUserId()

            return await fetch(`${basePath}${endpoint}`, options)
        },
        async launchJob(tool_id, inputs) {
            this.jobs[tool_id] = {
                id: "",
                start: Date.now(),
                submitted: true,
                state: "submitting",
                url: "",
                url_ready: false
            }
            this.updateCalveraSpinner()

            if (this.requires_galaxy_login) {
                this.jobs[tool_id].state = "stopped"
                return
            }

            // Datafile tools ingest a file from the instrument's local/network
            // filesystem (see GalaxyManager.ingest_file in the Django backend) -
            // the browser has no access to that path, so this one launch path
            // has to stay server-mediated regardless of how monitoring/stopping
            // are done.
            const isDatafileTool = Object.keys(inputs || {}).some((key) => key.startsWith("file_"))
            if (isDatafileTool) {
                return await this.launchJobViaDjango(tool_id, inputs)
            }

            try {
                const historyId = await getHistoryId(galaxyHistoryName)
                const results = await runTool(historyId, tool_id, inputs)
                const job_id = results.jobs[0].id

                this.running = true
                this.jobs[tool_id].id = job_id

                return job_id
            } catch (error) {
                this.jobs[tool_id].state = "stopped"

                if (error instanceof GalaxyApiError && error.status === 403) {
                    window.location.reload()
                    return null
                }

                this.showErrorWithTimeout(
                    `${galaxyAlias} failed to process your request. Please try again in a few minutes.`,
                    tool_id
                )

                return null
            }
        },
        async launchJobViaDjango(tool_id, inputs) {
            const response = await this.galaxyFetch("api/galaxy/launch/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": Cookies.get("csrftoken")
                },
                body: JSON.stringify({
                    api_key: this.user.apiKey,
                    tool_id: tool_id,
                    inputs: inputs
                })
            })

            if (response.status === 200) {
                this.running = true
                const data = await response.json()
                this.jobs[tool_id].id = data.id

                return data.id
            } else {
                this.jobs[tool_id].state = "stopped"

                await this.handleError(response, Object.keys(inputs).length <= 0, tool_id)

                return null
            }
        },
        async stopJob(job_id, tool_id) {
            if (tool_id !== undefined) {
                this.jobs[tool_id].state = "stopping"
                this.updateCalveraSpinner()
            }

            const stopped = await cancelJob(job_id)

            if (stopped) {
                this.running = true
            } else if (tool_id !== undefined) {
                this.jobs[tool_id].state = "ready"

                this.showErrorWithTimeout(
                    `${galaxyAlias} failed to stop this tool. Please try again in a few minutes.`,
                    tool_id
                )
            }
        },
        async monitorJobs() {
            if (this.is_monitoring || !this.user.is_logged_in) {
                return
            }

            this.is_monitoring = true

            try {
                const job_ids = {}
                for (const j in this.jobs) {
                    job_ids[j] = this.jobs[j].id
                }

                let data = null
                let requestFailed = false
                try {
                    data = await fetchJobStatus(galaxyHistoryName, job_ids)
                } catch (error) {
                    requestFailed = true
                    if (error instanceof GalaxyApiError && error.status === 403) {
                        if (this.monitoring_autolaunch) {
                            return
                        }
                        // The user's Galaxy session has expired; a reload sends them back through login.
                        window.location.reload()
                        return
                    }
                }

                if (!requestFailed) {
                    let hasErrors = false

                    this.all_jobs = data.jobs

                    // Look for jobs that are running
                    for (const job of data.jobs) {
                        if (job.is_datafile_tool || job.is_extra_tool) {
                            continue
                        }

                        if (!(job.tool_id in this.jobs)) {
                            this.jobs[job.tool_id] = {
                                id: job.job_id,
                                start: Date.now(),
                                submitted: false,
                                url: "",
                                url_ready: false
                            }
                        }

                        if (
                            !["ready", "stopping"].includes(this.jobs[job.tool_id].state) &&
                            job.state !== "ok"
                        ) {
                            this.jobs[job.tool_id].state = job.state
                        }

                        if (job.state === "ok") {
                            if (this.jobs[job.tool_id].id === job.job_id) {
                                this.jobs[job.tool_id].state = "ok"
                            }
                        } else {
                            this.jobs[job.tool_id].id = job.job_id
                        }

                        if (["deleted", "deleting"].includes(job.state)) {
                            delete this.jobs[job.tool_id]
                        } else if (
                            job.state === "error" &&
                            !this.failed_jobs.includes(job.job_id)
                        ) {
                            this.failed_jobs.push(job.job_id)

                            hasErrors = true
                            this.showErrorWithTimeout(
                                `${galaxyAlias} error: ${job?.error ? job?.error : "something unexpected has occurred. If this persists, please use the 'Report Issue' button in the header to let us know."}`
                            )
                        }

                        if (job.url && !this.jobs[job.tool_id].url_ready) {
                            this.jobs[job.tool_id].url = job.url
                            this.jobs[job.tool_id].url_ready = job.url_ready
                        }

                        if (
                            job.state === "running" &&
                            this.jobs[job.tool_id].state !== "stopping" &&
                            this.jobs[job.tool_id].state !== "ready" &&
                            job.url_ready
                        ) {
                            this.user.getAutoopen()
                            if (
                                this.user.autoopen &&
                                this.allow_autoopen &&
                                this.jobs[job.tool_id].submitted
                            ) {
                                window.open(job.url, "_blank")
                            }

                            this.jobs[job.tool_id].state = "ready"
                        }
                    }

                    // Look for jobs that have stopped running
                    Object.keys(this.jobs).forEach((tool_id) => {
                        const job = this.jobs[tool_id]

                        if (
                            !["submitting", "new", "queued", "running"].includes(job.state) &&
                            !data.jobs.some((target) => target.job_id === job.id)
                        ) {
                            // Tool stopped gracefully
                            delete this.jobs[tool_id]
                        } else if (
                            !["ok", "error", "running", "ready", "stopping"].includes(job.state) &&
                            Date.now() - job.start > this.timeout_duration
                        ) {
                            // The job hasn't started in one minute, something unexpected has happened.
                            job.state = "error"

                            this.showErrorWithTimeout(
                                `${galaxyAlias} error: Tool failed to respond within one minute. This may be due to an outage on ${galaxyUrl}.`,
                                tool_id
                            )
                        }
                    })

                    if (!hasErrors && !this.timeout_error && !this.static_error) {
                        this.galaxy_error = ""
                    }
                } else {
                    this.galaxy_error = `${galaxyAlias} failed to process your request. Please try again in a few minutes.`
                }

                this.updateCalveraSpinner()

                if (this.callback !== undefined && this.callback !== null) {
                    this.callback()
                }

                // nextTick ensures that any updates to the UI from this monitoring loop have been committed.
                // Setting this flag will allow users to launch tools, which should only be possible after
                // the UI has been updated with the results of the initial monitoring.
                nextTick(() => {
                    this.has_monitored = true
                })
            } finally {
                this.is_monitoring = false
            }
        },
        startMonitor(allow_autoopen, callback, monitoring_autolaunch) {
            this.allow_autoopen = allow_autoopen
            this.callback = callback
            this.monitoring_autolaunch = monitoring_autolaunch

            this.stopMonitor()
            this.monitorJobs()

            // Push-driven updates via Galaxy's native SSE stream (requires Galaxy
            // 26.1+ with enable_sse_updates: true - see galaxyDirect.js). Both
            // entry_point_update (interactive tool state) and history_update
            // (job/dataset state) can signal a change worth re-checking.
            this.event_source = openEventStream({
                onEntryPointUpdate: () => this.monitorJobs(),
                onHistoryUpdate: () => this.monitorJobs()
            })

            // Fallback poll: Galaxy's SSE support is new, admin-gated, and even
            // its own PR review noted it can silently drop events, so we keep a
            // low-frequency safety net instead of trusting push exclusively.
            this.monitor_interval = window.setInterval(this.monitorJobs, this.fallback_timeout)
        },
        stopMonitor() {
            if (this.event_source !== null) {
                this.event_source.close()
                this.event_source = null
            }
            if (this.monitor_interval !== null) {
                window.clearInterval(this.monitor_interval)
                this.monitor_interval = null
            }
        },
        updateCalveraSpinner() {
            // Turn on the spinner in the footer if any job is being started or stopped
            this.running = Object.values(this.jobs).some((job) => {
                return ["submitting", "new", "queued", "running", "stopping"].includes(job.state)
            })
        }
    }
})
