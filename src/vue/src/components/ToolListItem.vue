<!-- Creates a VListItem for launching, opening, and stopping a Galaxy tool. -->
<template>
    <v-list-item>
        <template v-slot:prepend>
            <v-btn
                :href="getAutolaunchURL(tool.id)"
                class="mr-2"
                size="x-small"
                icon
                rounded
                tile
                @click.prevent="setClipboard(getAutolaunchURL(tool.id))"
            >
                <v-icon>mdi-content-copy</v-icon>

                <v-tooltip activator="parent" max-width="300" open-delay="250">
                    <p v-if="linkCopied">Auto-launch link copied!</p>
                    <p v-else>
                        Click to copy a direct link to this app. If you use this tool frequently,
                        consider creating a browser bookmark or desktop shortcut to this link.
                    </p>
                </v-tooltip>
            </v-btn>
        </template>

        <v-list-item-title>
            {{ tool.name }}
            <span class="text-caption">{{ tool.version }}</span>
        </v-list-item-title>
        <v-list-item-subtitle v-if="props.job === null" :title="tool.description">
            {{ tool.description }}
        </v-list-item-subtitle>
        <v-list-item-subtitle
            v-else-if="props.job.is_datafile_tool"
            :title="parseParams(props.job.parameters)"
        >
            Autolaunched with parameters: {{ parseParams(props.job.parameters) }}
        </v-list-item-subtitle>

        <template v-slot:append>
            <v-list-item-action>
                <v-btn v-if="!is_logged_in" disabled>Sign in to run apps</v-btn>
                <v-btn v-else-if="!has_monitored" disabled>Checking login status</v-btn>
                <div v-else>
                    <ToolStatus
                        v-if="isChanging(jobs, tool.id) && props.job === null"
                        :state="jobs[tool.id]?.state"
                        :url="jobs[tool.id]?.url"
                        :url-ready="jobs[tool.id]?.url_ready"
                    />

                    <v-btn
                        v-if="canLaunch(jobs, tool.id) && props.job === null"
                        color="primary"
                        @click="job.launchJob(tool.id)"
                    >
                        Start
                        <v-icon>mdi-play</v-icon>
                    </v-btn>
                    <v-btn
                        v-if="canUse(jobs, tool.id) || props.job !== null"
                        :href="props.job === null ? jobs[tool.id]?.url : props.job.url"
                        target="_blank"
                    >
                        Open
                        <v-icon>mdi-open-in-new</v-icon>
                    </v-btn>
                    <v-btn
                        v-if="canStop(jobs, tool.id) || props.job !== null"
                        color="error"
                        @click="stopJob()"
                    >
                        Stop
                        <v-icon>mdi-stop</v-icon>
                    </v-btn>
                </div>
            </v-list-item-action>
        </template>
    </v-list-item>
</template>

<script setup>
import { storeToRefs } from "pinia"
import { ref } from "vue"

import ToolStatus from "@/components/ToolStatus.vue"
import { useJobStore } from "@/stores/job"
import { useUserStore } from "@/stores/user"

const props = defineProps({
    job: {
        default: null,
        required: false,
        type: [Object, null]
    },
    tool: {
        required: true,
        type: Object
    }
})

const job = useJobStore()
const { has_monitored, jobs } = storeToRefs(job)
const user = useUserStore()
const { is_logged_in } = storeToRefs(user)
const linkCopied = ref(false)

const basePath = import.meta.env.VITE_BASE_PATH

function canLaunch(jobs, tool_id) {
    return !["submitting", "new", "queued", "running", "ready", "stopping"].includes(
        jobs[tool_id]?.state
    )
}

function canUse(jobs, tool_id) {
    return jobs[tool_id]?.state === "ready"
}

function canStop(jobs, tool_id) {
    return ["new", "queued", "running", "ready"].includes(jobs[tool_id]?.state)
}

function isChanging(jobs, tool_id) {
    return ["submitting", "new", "queued", "running", "stopping"].includes(jobs[tool_id]?.state)
}

function stopJob() {
    if (props.job === null) {
        job.stopJob(jobs.value[props.tool.id].id, props.tool.id)
    } else {
        job.stopJob(props.job.job_id)
    }
}

function parseParams(parameters) {
    return Object.keys(props.job.parameters)
        .map(function (key) {
            return `${key}: ${props.job.parameters[key]}`
        })
        .join(", ")
}

function getAutolaunchURL(tool_id) {
    return window.location.origin + `${basePath}launch/${tool_id}`
}

function setClipboard(text) {
    navigator.clipboard.writeText(text)

    linkCopied.value = true
    setTimeout(() => {
        linkCopied.value = false
    }, 2000)
}
</script>

<style scoped>
.auto-launch-btn {
    min-width: 0;
}
</style>
