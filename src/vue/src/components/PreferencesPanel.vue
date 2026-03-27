<template>
    <v-btn v-if="is_logged_in" icon>
        <v-icon>mdi-cogs</v-icon>

        <v-menu activator="parent" :close-on-content-click="false">
            <v-card width="400">
                <v-card-title>Preferences</v-card-title>

                <v-card-text>
                    <v-switch
                        v-model="autoopen"
                        label="Automatically Open Tools in a New Tab After Launch"
                        hide-details
                        @click="user.toggleAutoopen()"
                    />
                    <p class="text-caption">
                        If tools don't automatically open after launching, then you may need to
                        allow pop-ups on this site in your browser or browser extension settings.
                    </p>
                </v-card-text>
            </v-card>
        </v-menu>
    </v-btn>
</template>

<script setup>
import { storeToRefs } from "pinia"
import { onMounted } from "vue"

import { useUserStore } from "@/stores/user"

const user = useUserStore()
const { autoopen, is_logged_in } = storeToRefs(user)

onMounted(() => {
    user.getAutoopen()
})
</script>
