<template>
    <v-btn icon>
        <v-icon>mdi-menu</v-icon>

        <v-menu activator="parent" :close-on-content-click="false">
            <v-list class="py-0">
                <v-list-item v-if="is_logged_in" border="b-thin">
                    Logged in as {{ email }}
                </v-list-item>
                <v-list-item v-if="is_logged_in" border="b-thin" class="cursor-pointer">
                    {{ props.toolList.length }} Running Tool{{
                        props.toolList.length === 1 ? "" : "s"
                    }}

                    <ActiveToolsPanel :tool-list="props.toolList" class="mr-4" />
                </v-list-item>
                <v-list-item border="b-thin" class="cursor-pointer" prepend-icon="mdi-information">
                    About This Dashboard

                    <InfoPanel />
                </v-list-item>
                <v-list-item
                    :href="galaxyUrl"
                    border="b-thin"
                    class="cursor-pointer"
                    prepend-icon="mdi-open-in-new"
                    target="_blank"
                >
                    {{ galaxyAlias }}
                </v-list-item>
                <v-list-item border="b-thin" class="cursor-pointer" prepend-icon="mdi-note-text">
                    Citing {{ galaxyAlias }}/{{ novaAlias }}

                    <CitationPanel />
                </v-list-item>
                <v-list-item border="b-thin" class="cursor-pointer" prepend-icon="mdi-bug">
                    Report Issue

                    <BugPanel ref="bugPanelMobile" />
                </v-list-item>
                <v-list-item border="b-thin" class="cursor-pointer" prepend-icon="mdi-help">
                    Documentation

                    <HelpPanel />
                </v-list-item>
                <v-list-item
                    v-if="is_logged_in"
                    border="b-thin"
                    class="cursor-pointer"
                    prepend-icon="mdi-cogs"
                >
                    Preferences

                    <PreferencesPanel />
                </v-list-item>
                <v-list-item
                    v-if="is_logged_in"
                    class="cursor-pointer"
                    prepend-icon="mdi-logout"
                    href="/user"
                >
                    Logout via {{ galaxyAlias }}
                </v-list-item>
            </v-list>
        </v-menu>
    </v-btn>
    <div class="d-flex flex-row h-100 justify-center">
        <v-app-bar-title class="cursor-pointer flex-0-1" @click="$router.push(basePath)">
            <v-img :src="`${basePath}logo_bw.png`" alt="NOVA Logo" width="200" />
        </v-app-bar-title>
    </div>
    <v-spacer />
    <v-btn v-if="!is_logged_in && !route.path.startsWith('/launch')" :href="loginUrl">
        Login
    </v-btn>
</template>

<script setup>
import { storeToRefs } from "pinia"
import { computed, onMounted } from "vue"
import { useRoute } from "vue-router"

import ActiveToolsPanel from "@/components/ActiveToolsPanel.vue"
import BugPanel from "@/components/BugPanel.vue"
import CitationPanel from "@/components/CitationPanel.vue"
import HelpPanel from "@/components/HelpPanel.vue"
import InfoPanel from "@/components/InfoPanel.vue"
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
const { email, is_logged_in } = storeToRefs(user)

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
