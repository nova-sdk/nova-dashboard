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

                    <div>
                        <v-btn v-for="provider in auth_urls" :href="provider.url" class="mx-1">
                            {{ provider.name }}
                        </v-btn>
                    </div>
                </div>
                <div v-else>
                    <ToolStatus
                        v-if="targetJob !== null"
                        :state="targetJob.state"
                        :url="targetJob.url"
                    />
                    <v-progress-circular v-else indeterminate />
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

const job = useJobStore()
const { all_jobs, jobs } = storeToRefs(job)
const user = useUserStore()
const { checking_galaxy_login, is_logged_in, auth_urls } = storeToRefs(user)
const route = useRoute()
const router = useRouter()

const foundInGalaxy = ref(false)
const targetJob = ref(null)
const targetTool = ref(null)
let inputs = {}
let hasInputs = false
let targetJobId = null

function monitorCallback() {
    if (!is_logged_in || checking_galaxy_login.value || targetTool.value === null) {
        return
    }

    if (hasInputs) {
        for (const job of all_jobs.value) {
            if (job.job_id === targetJobId) {
                targetJob.value = job
            }
        }
    } else {
        for (const id in jobs.value) {
            if (id === targetTool.value.id && jobs.value[id].state !== "stopped") {
                foundInGalaxy.value = true
                targetJob.value = jobs.value[id]
            }
        }

        // We are logged in, the tool has been confirmed to exist, and we didn't find any job for it in Galaxy,
        // so we can launch it here.
        if (targetJob.value === null) {
            job.launchJob(targetTool.value.id, inputs)
            targetJob.value = jobs.value[targetTool.value.id]
        }
    }

    if (
        targetJob.value !== null &&
        (targetJob.value.state === "ready" || targetJob.value.url_ready)
    ) {
        window.location.href = targetJob.value.url
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

    if (hasInputs) {
        targetJobId = await job.launchJob(targetTool.value.id, inputs)
    }

    job.startMonitor(false, monitorCallback, true)
    if (!user.is_logged_in) {
        window.localStorage.setItem("lastpath", route.path)
        window.localStorage.setItem("redirect", true)
    }
})
</script>
