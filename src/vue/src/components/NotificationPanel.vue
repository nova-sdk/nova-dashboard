<template>
    <v-btn size="x-small" icon>
        <v-icon>mdi-bell</v-icon>

        <v-menu activator="parent" :close-on-content-click="false" open-on-hover>
            <v-card max-width="800">
                <v-card-title class="mb-2 px-0">Set System Notification</v-card-title>

                <v-card-text class="px-0">
                    <v-switch v-model="displayNotification" label="Display?" />
                    <v-textarea
                        v-model="notificationMessage"
                        label="Change Notification"
                        rows="1"
                        width="300"
                        auto-grow
                        outlined
                        @update:modelValue="onMessageUpdate"
                    />
                </v-card-text>

                <v-card-actions class="px-0">
                    <v-btn color="primary" @click="setNotification">Save</v-btn>
                </v-card-actions>
            </v-card>
        </v-menu>
    </v-btn>
</template>

<script setup>
import Cookies from "js-cookie"
import { storeToRefs } from "pinia"
import { onBeforeUnmount, onMounted, ref } from "vue"

import { useUserStore } from "@/stores/user"

const user = useUserStore()
const { is_admin } = storeToRefs(user)

const basePath = import.meta.env.VITE_BASE_PATH

const displayNotification = ref(false)
const notificationMessage = ref("")
const notificationUrl = `${basePath}api/notification/`
let pollInterval = null

async function getNotification() {
    try {
        const response = await fetch(notificationUrl)

        if (!response.ok) {
            throw new Error("Failed to fetch")
        }

        const data = await response.json()

        if (data?.display) {
            displayNotification.value = data.display
        }

        if (data?.message) {
            notificationMessage.value = data.message
        }
    } catch (error) {
        console.error("Failed to fetch notification:", error)
    }
}

async function setNotification() {
    try {
        const response = await fetch(notificationUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": Cookies.get("csrftoken")
            },
            body: JSON.stringify({
                api_key: user.apiKey,
                display: displayNotification.value,
                message: notificationMessage.value
            })
        })

        if (!response.ok) {
            throw new Error("Failed to post notification")
        }
    } catch (err) {
        console.error("Error posting notification:", err)
    }
}

onMounted(async () => {
    getNotification()
    pollInterval = setInterval(getNotification, 60000)
})

onBeforeUnmount(() => {
    clearInterval(pollInterval)
})

defineExpose({
    displayNotification,
    notificationMessage
})
</script>

<style scoped>
.notification-message {
    white-space: pre-wrap;
}
</style>
