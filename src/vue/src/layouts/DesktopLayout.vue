<template>
    <div class="app-bar-corner app-bar-start">
        <v-app-bar-title class="cursor-pointer flex-0-1 mr-1" @click="$router.push(basePath)">
            <v-img :src="`${basePath}logo_bw.png`" alt="NOVA Logo" width="200" />
        </v-app-bar-title>

        <v-btn size="x-small" icon>
            <v-icon>mdi-information-outline</v-icon>

            <InfoPanel />
        </v-btn>
        <NotificationPanel ref="notificationPanel" v-show="is_admin" />
        <a :href="galaxyUrl" class="mx-2 text-decoration-none text-white" target="_blank">
            <v-tooltip activator="parent">{{ galaxyAlias }}</v-tooltip>

            <v-img :src="`${basePath}galaxy_icon.png`" alt="Galaxy Square Logo" width="20" />
        </a>
        <v-btn size="small">
            Citing {{ galaxyAlias }}/{{ novaAlias }}

            <CitationPanel />
        </v-btn>
    </div>

    <div class="app-bar-corner app-bar-end">
        <v-btn v-show="props.toolList.length > 0" icon>
            <v-badge :content="props.toolList.length">
                <v-icon>mdi-laptop</v-icon>
            </v-badge>

            <ActiveToolsPanel :tool-list="props.toolList" class="mr-4" />
        </v-btn>
        <v-btn size="small">
            Report Issue

            <BugPanel ref="bugPanel" />
        </v-btn>
        <v-btn icon>
            <v-icon>mdi-help</v-icon>

            <HelpPanel />
        </v-btn>

        <v-btn v-if="!is_logged_in && !route.path.startsWith('/launch')" :href="loginUrl">
            Login
        </v-btn>

        <PreferencesPanel />

        <v-btn v-if="is_logged_in" icon>
            <v-icon>mdi-account-circle</v-icon>

            <v-menu activator="parent">
                <v-list>
                    <v-list-item> Logged in as {{ email }} </v-list-item>
                    <v-list-item prepend-icon="mdi-logout" href="/user">
                        Logout via {{ galaxyAlias }}
                    </v-list-item>
                </v-list>
            </v-menu>
        </v-btn>
    </div>
</template>

<script setup>
import { storeToRefs } from "pinia"
import { ref, computed, onMounted } from "vue"
import { useRoute } from "vue-router"

import ActiveToolsPanel from "@/components/ActiveToolsPanel.vue"
import BugPanel from "@/components/BugPanel.vue"
import CitationPanel from "@/components/CitationPanel.vue"
import HelpPanel from "@/components/HelpPanel.vue"
import InfoPanel from "@/components/InfoPanel.vue"
import NotificationPanel from "@/components/NotificationPanel.vue"
import PreferencesPanel from "@/components/PreferencesPanel.vue"
import { useUserStore } from "@/stores/user"

const props = defineProps({
    toolList: {
        required: true,
        type: Object
    }
})

// Store references
const route = useRoute()
const user = useUserStore()
const { email, is_admin, is_logged_in } = storeToRefs(user)

// General variables
const baseLoginUrl = import.meta.env.VITE_LOGIN_URL
const basePath = import.meta.env.VITE_BASE_PATH
const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const galaxyUrl = import.meta.env.VITE_GALAXY_URL
const novaAlias = import.meta.env.VITE_NOVA_ALIAS
const loginUrl = computed(() => baseLoginUrl + route.fullPath.replace(basePath, "/"))

onMounted(async () => {
    await user.getUser()
})
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
