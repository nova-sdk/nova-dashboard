<!-- Defines the content that should be loaded regardless of what route the user is viewing. -->
<template>
    <v-app>
        <v-main>
            <v-app-bar elevation="0">
                <DesktopLayout v-if="mdAndUp" :tool-list="toolList" />
                <MobileLayout v-else :tool-list="toolList" />
            </v-app-bar>

            <StatusPanel />
            <v-banner
                v-if="
                    notificationPanel &&
                    notificationPanel.displayNotification &&
                    notificationPanel.notificationMessage
                "
                class="bg-warning justify-center py-0"
            >
                <v-icon class="mr-1">mdi-information-outline</v-icon>
                {{ notificationPanel.notificationMessage }}
            </v-banner>

            <v-fab
                v-if="
                    (genericTools?.tools?.length > 0 ||
                        genericTools?.prototype_tools?.length > 0) &&
                    !drawer
                "
                location="right center"
                app
                icon
                @click="toggleDrawer"
            >
                <v-icon>mdi-tools</v-icon>
                <v-tooltip activator="parent">Tools that can be used by all techniques.</v-tooltip>
            </v-fab>
            <v-navigation-drawer v-model="drawer" location="right" width="450" app temporary>
                <ToolDrawer :tool-data="genericTools" />
            </v-navigation-drawer>

            <RouterView v-if="user.ready" />

            <v-footer class="justify-center my-0 px-1 py-0 text-center" app border>
                <v-progress-circular
                    :indeterminate="running"
                    class="mr-1"
                    color="primary"
                    size="16"
                    width="3"
                />
                <a
                    :href="galaxyUrl"
                    class="text-grey-lighten-1 text-caption text-decoration-none"
                    target="_blank"
                >
                    Powered by {{ galaxyAlias }}
                </a>
                <v-spacer />
                <a
                    href="https://www.ornl.gov/"
                    class="text-grey-lighten-1 text-caption text-decoration-none"
                    target="_blank"
                >
                    © {{ new Date().getFullYear() }} ORNL
                </a>
            </v-footer>
        </v-main>
    </v-app>
</template>

<script setup>
import { storeToRefs } from "pinia"
import { computed, ref } from "vue"
import { RouterView } from "vue-router"
import { useDisplay } from "vuetify"

import DesktopLayout from "@/layouts/DesktopLayout.vue"
import MobileLayout from "@/layouts/MobileLayout.vue"
import ToolDrawer from "@/components/ToolDrawer.vue"
import { getTools } from "@/router"
import { useJobStore } from "@/stores/job"
import { useUserStore } from "@/stores/user"
import StatusPanel from "@/components/StatusPanel.vue"

const { mdAndUp } = useDisplay()
const job = useJobStore()
const { all_jobs, jobs, running } = storeToRefs(job)
const user = useUserStore()
const drawer = ref(false)
const notificationPanel = ref(null)
const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const galaxyUrl = import.meta.env.VITE_GALAXY_URL

const genericTools = computed(() => {
    const tools = getTools()

    if ("generic-tools" in tools) {
        return tools["generic-tools"]
    }

    return []
})

function toggleDrawer() {
    drawer.value = !drawer.value
}

const jobList = computed(() => {
    return Object.entries(jobs.value)
})

const toolList = computed(() => {
    const tools = getTools()

    // Returns all tools connected with a Galaxy job
    const runningTools = []
    Object.values(tools).forEach((toolCategory) => {
        let all_tools = toolCategory.tools
        if (toolCategory.prototype_tools !== undefined) {
            all_tools = all_tools.concat(toolCategory.prototype_tools)
        }
        all_tools.forEach((tool) => {
            jobList.value.forEach(([job_tool_id, job]) => {
                if (
                    tool.id === job_tool_id &&
                    job.state === "ready" &&
                    !runningTools.some((target) => target.id === tool.id)
                ) {
                    runningTools.push({ job: null, tool: tool })
                }
            })

            all_jobs.value.forEach((job) => {
                if (job.is_datafile_tool && tool.id === job.tool_id && job.url_ready) {
                    runningTools.push({ job: job, tool: tool })
                }
            })
        })
    })

    return runningTools
})
</script>
