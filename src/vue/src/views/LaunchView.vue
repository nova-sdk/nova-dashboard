<template>
    <v-container class="align-start d-flex justify-center mt-4 text-center">
        <v-card width="1280">
            <v-card-title v-if="targetTool !== null" class="mb-8">
                {{ targetTool?.name }}
            </v-card-title>

            <v-banner v-if="job.galaxy_error" class="bg-error">
                {{ job.galaxy_error }}
            </v-banner>
            <v-card-text v-else>
                <!-- Login required -->
                <div v-if="!is_logged_in">
                    <p class="mb-2">You must log in before your tool can be launched.</p>

                    <v-btn :href="loginUrl">Login</v-btn>
                </div>
                <div v-else>
                    <ToolStatus
                        :state="targetJob !== null ? targetJob.state : 'connecting'"
                        :url="targetJob !== null ? targetJob.url : ''"
                    />
                </div>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup>
import { storeToRefs } from "pinia"
import { onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"

import ToolStatus from "@/components/ToolStatus.vue"
import { useJobStore } from "@/stores/job"
import { useUserStore } from "@/stores/user"

const props = defineProps({
    tools: {
        required: true,
        type: Object
    }
})

const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const loginUrl = import.meta.env.VITE_LOGIN_URL

const job = useJobStore()
const { all_jobs, has_monitored } = storeToRefs(job)
const user = useUserStore()
const { is_logged_in } = storeToRefs(user)
const route = useRoute()
const router = useRouter()

const targetJob = ref(null)
const targetTool = ref(null)
let inputs = {}
let hasInputs = false
let launched = false
let targetJobId = null

async function monitorCallback() {
    if (!has_monitored.value || !is_logged_in.value || targetTool.value === null) {
        return
    }

    for (const job of all_jobs.value) {
        if (job.job_id === targetJobId) {
            targetJob.value = job
        }
    }

    if (!hasInputs && targetJob.value === null) {
        // We are logged in, the tool has been confirmed to exist, and we didn't find any job for it in Galaxy,
        // so we can launch it here.
        if (targetJob.value === null && !launched) {
            targetJobId = await job.launchJob(targetTool.value.id, inputs)
            launched = true
        }
    }

    if (targetJob.value !== null) {
        if (targetJob.value?.state === "error") {
            job.static_error = true
            job.galaxy_error = `${galaxyAlias} error: ${targetJob.value?.error ? targetJob.value?.error : "something unexpected has occurred. Please try again."}`
        } else if (targetJob.value?.state === "ready" || targetJob.value?.url_ready) {
            window.location.href = targetJob.value.url
        }
    }
}

function findTargetTool() {
    let foundTool = null

    for (const key in props.tools) {
        let toolList = props.tools[key].tools
        if (props.tools[key].prototype_tools !== undefined) {
            toolList = toolList.concat(props.tools[key].prototype_tools)
        }
        toolList.forEach((tool) => {
            if (tool.id === route.params.tool) {
                foundTool = tool
            }
        })
    }

    return foundTool
}

onMounted(async () => {
    inputs = route.query
    if (Object.keys(inputs).length > 0) {
        hasInputs = true
    }

    targetTool.value = findTargetTool()
    if (targetTool.value === null) {
        router.replace({
            name: "not-found",
            params: { catchAll: route.path.substring(1).split("/") }
        })
    }

    if (hasInputs && user.is_logged_in) {
        await user.getApiKey()

        targetJobId = await job.launchJob(targetTool.value.id, inputs)
        if (targetJobId === null) {
            // The tool failed to launch. launchJob will take care of error handling,
            // so there's nothing else to do until the user refreshes the page.
            return
        }

        launched = true
    }

    job.startMonitor(false, monitorCallback, true)
    if (!user.is_logged_in) {
        window.localStorage.setItem("lastpath", route.fullPath)
        window.localStorage.setItem("redirect", true)
    }
})
</script>
