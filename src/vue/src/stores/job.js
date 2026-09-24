import { defineStore } from "pinia"
import { nextTick } from "vue"

import {
    cancelJob,
    DatafileRegistrationError,
    fetchJobStatus,
    GalaxyApiError,
    launchTool,
    openEventStream,
    TERMINAL_STATES
} from "@/services/galaxyDirect"
import { useUserStore } from "@/stores/user"

const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const galaxyUrl = import.meta.env.VITE_GALAXY_URL
const galaxyHistoryName = import.meta.env.GALAXY_HISTORY_NAME || "launcher_history"

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
            // Set when monitorJobs() is requested while a run is in flight, so the
            // triggering SSE event isn't dropped - see monitorJobs().
            monitor_requested: false,
            jobs: {},
            running: false,
            event_source: null,
            // Galaxy's SSE stream only reports changes to history/dataset rows and an
            // interactive tool's entry point becoming ready, so a job with no outputs
            // (queued -> running, exiting on its own, errors, cancellation) produces no
            // event. While any job is in flight, monitorJobs() therefore reschedules
            // itself every poll_interval - see schedulePoll().
            poll_interval: 2000,
            poll_timer: null,
            // Set while Galaxy's SSE stream is down. The error has to stay visible
            // until the stream reconnects, even if a poll in between succeeds.
            stream_error: false,
            timeout_error: false,
            timeout_duration: 60000,
            error_reset_duration: 15000,
            monitoring_autolaunch: false
        }
    },
    actions: {
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

            // Tools launched with inputs are datafile tools; their launch errors are shown until dismissed.
            const isDatafileTool = Object.keys(inputs || {}).length > 0

            try {
                const job_id = await launchTool(galaxyHistoryName, tool_id, inputs || {})

                this.running = true
                this.jobs[tool_id].id = job_id

                // Start polling now that a job is in flight.
                this.monitorJobs()

                return job_id
            } catch (error) {
                this.jobs[tool_id].state = "stopped"

                if (error instanceof GalaxyApiError && error.status === 403) {
                    window.location.reload()
                    return null
                }

                const message =
                    error instanceof DatafileRegistrationError
                        ? `${galaxyAlias} error: ${error.message}`
                        : `${galaxyAlias} failed to process your request. Please try again in a few minutes.`
                if (isDatafileTool) {
                    this.galaxy_error = message
                } else {
                    this.showErrorWithTimeout(message, tool_id)
                }

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

                // Galaxy marks the job deleted before responding, so resync now rather
                // than waiting for the next poll.
                this.monitorJobs()
            } else if (tool_id !== undefined) {
                this.jobs[tool_id].state = "ready"

                this.showErrorWithTimeout(
                    `${galaxyAlias} failed to stop this tool. Please try again in a few minutes.`,
                    tool_id
                )
            }
        },
        async monitorJobs() {
            if (!this.user.is_logged_in) {
                return
            }
            if (this.is_monitoring) {
                // Updates are push-only, so an event that arrives mid-run must not be
                // dropped: run once more after the current run finishes.
                this.monitor_requested = true
                return
            }

            this.is_monitoring = true
            this.monitor_requested = false

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

                    if (
                        !hasErrors &&
                        !this.timeout_error &&
                        !this.static_error &&
                        !this.stream_error
                    ) {
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
                if (this.monitor_requested) {
                    this.monitorJobs()
                } else {
                    this.schedulePoll()
                }
            }
        },
        jobsInFlight() {
            return (
                Object.values(this.jobs).some((job) =>
                    ["submitting", "new", "queued", "running", "ready", "stopping"].includes(
                        job.state
                    )
                ) ||
                this.all_jobs.some(
                    (job) =>
                        (job.is_datafile_tool || job.is_extra_tool) &&
                        !TERMINAL_STATES.includes(job.state)
                )
            )
        },
        schedulePoll() {
            window.clearTimeout(this.poll_timer)
            this.poll_timer = null

            // Only poll while there is something SSE can't tell us about; an idle
            // dashboard is woken by launchJob() or an SSE event instead. Failures
            // are not swallowed: each run shows its own error banner.
            if (this.event_source !== null && this.jobsInFlight()) {
                this.poll_timer = window.setTimeout(() => this.monitorJobs(), this.poll_interval)
            }
        },
        startMonitor(allow_autoopen, callback, monitoring_autolaunch) {
            this.allow_autoopen = allow_autoopen
            this.callback = callback
            this.monitoring_autolaunch = monitoring_autolaunch

            this.stopMonitor()

            // Galaxy's native SSE stream (requires Galaxy 26.1+ with
            // enable_sse_updates: true - see galaxyDirect.js) gives instant updates;
            // schedulePoll() covers the job state changes it can't report. If the
            // stream fails, the user sees an error instead of silently degraded monitoring.
            this.event_source = openEventStream({
                onEntryPointUpdate: () => this.monitorJobs(),
                onHistoryUpdate: () => this.monitorJobs(),
                onOpen: () => {
                    if (this.stream_error) {
                        // The browser reconnected on its own; resync anything missed while down.
                        this.stream_error = false
                        this.galaxy_error = ""
                        this.monitorJobs()
                    }
                },
                onError: () => {
                    this.stream_error = true
                    if (this.event_source?.readyState === EventSource.CLOSED) {
                        // Not retryable (e.g. SSE disabled on Galaxy, or an auth failure).
                        this.galaxy_error = `${galaxyAlias} live job updates are unavailable. Please refresh the page, and if this persists, use the 'Report Issue' button in the header to let us know.`
                    } else {
                        this.galaxy_error = `${galaxyAlias} live job updates were interrupted. Reconnecting...`
                    }
                }
            })

            // After the stream exists, so the first run can schedule the poll.
            this.monitorJobs()
        },
        stopMonitor() {
            if (this.event_source !== null) {
                this.event_source.close()
                this.event_source = null
            }
            window.clearTimeout(this.poll_timer)
            this.poll_timer = null
            this.stream_error = false
        },
        updateCalveraSpinner() {
            // Turn on the spinner in the footer if any job is being started or stopped
            this.running = Object.values(this.jobs).some((job) => {
                return ["submitting", "new", "queued", "running", "stopping"].includes(job.state)
            })
        }
    }
})
