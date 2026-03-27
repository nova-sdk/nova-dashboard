<!-- Defines the content that should be loaded regardless of what route the user is viewing. -->
<template>
    <v-app>
        <v-main>
            <v-app-bar elevation="0">
                <div class="app-bar-corner app-bar-start">
                    <v-app-bar-title
                        class="cursor-pointer flex-0-1 mr-1"
                        @click="$router.push(basePath)"
                    >
                        <v-img :src="`${basePath}logo_bw.png`" alt="NOVA Logo" width="200" />
                    </v-app-bar-title>

                    <InfoPanel />
                    <NotificationPanel ref="notificationPanel" v-show="is_admin" />
                    <a
                        :href="galaxyUrl"
                        class="mx-2 text-decoration-none text-white"
                        target="_blank"
                    >
                        <v-tooltip activator="parent">{{ galaxyAlias }}</v-tooltip>

                        <v-img
                            :src="`${basePath}galaxy_icon.png`"
                            alt="Galaxy Square Logo"
                            width="20"
                        />
                    </a>
                    <CitationPanel />
                </div>

                <div class="app-bar-corner app-bar-end">
                    <ActiveToolsPanel class="mr-4" />
                    <BugPanel ref="bugPanel" />
                    <HelpPanel />

                    <v-btn
                        v-if="!is_logged_in && !route.path.startsWith('/launch')"
                        :href="loginUrl"
                    >
                        Login
                    </v-btn>

                    <PreferencesPanel />

                    <v-btn v-if="is_logged_in" icon>
                        <v-icon>mdi-account-circle</v-icon>

                        <v-menu activator="parent">
                            <v-list>
                                <v-list-item>
                                    {{ email }}
                                </v-list-item>
                                <v-list-item prepend-icon="mdi-logout" href="/user">
                                    Logout via {{ galaxyAlias }}
                                </v-list-item>
                            </v-list>
                        </v-menu>
                    </v-btn>
                </div>
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
import { computed, onMounted, ref } from "vue"
import { storeToRefs } from "pinia"
import { RouterView, useRoute } from "vue-router"

import ActiveToolsPanel from "@/components/ActiveToolsPanel.vue"
import BugPanel from "@/components/BugPanel.vue"
import HelpPanel from "@/components/HelpPanel.vue"
import PreferencesPanel from "@/components/PreferencesPanel.vue"
import ToolDrawer from "@/components/ToolDrawer.vue"
import { getTools } from "@/router"
import { useJobStore } from "@/stores/job"
import { useUserStore } from "@/stores/user"
import CitationPanel from "@/components/CitationPanel.vue"
import InfoPanel from "@/components/InfoPanel.vue"
import NotificationPanel from "@/components/NotificationPanel.vue"
import StatusPanel from "@/components/StatusPanel.vue"

const job = useJobStore()
const { running } = storeToRefs(job)
const user = useUserStore()
const { email, is_admin, is_logged_in } = storeToRefs(user)
const route = useRoute()
const bugPanel = ref(null)
const drawer = ref(false)
const notificationPanel = ref(null)
const baseLoginUrl = import.meta.env.VITE_LOGIN_URL
const basePath = import.meta.env.VITE_BASE_PATH
const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const galaxyUrl = import.meta.env.VITE_GALAXY_URL

const loginUrl = computed(() => baseLoginUrl + route.fullPath.replace(basePath, "/"))

const genericTools = computed(() => {
    const tools = getTools()

    if ("generic-tools" in tools) {
        return tools["generic-tools"]
    }

    return []
})

onMounted(async () => {
    await user.getUser()
    bugPanel.value.setDefaultEmail()
})

function toggleDrawer() {
    drawer.value = !drawer.value
}
</script>

<style scoped>
.app-bar-corner {
    align-items: center;
    display: flex;
    flex-basis: 0;
    flex-grow: 1;
}

.app-bar-end {
    justify-content: end;
}
</style>
