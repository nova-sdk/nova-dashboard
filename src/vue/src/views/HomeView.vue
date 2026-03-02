<!-- Defines the content when the user is on the landing page. -->
<template>
    <v-container class="align-start d-flex justify-center">
        <v-card width="1280">
            <v-card-title class="text-center">Welcome to the {{ dashboardTitle }}</v-card-title>

            <v-card-text>
                <p class="mb-4 text-center">
                    You can view the different categories of tools available below. Simply click on
                    a category to access its tools.
                </p>

                <v-banner v-if="job.galaxy_error" class="bg-error text-center">
                    {{ job.galaxy_error }}
                </v-banner>

                <v-container>
                    <v-row>
                        <v-col
                            v-for="(technique, key) in availableTechniques"
                            :key="key"
                            cols="12"
                            lg="4"
                        >
                            <v-card
                                :to="`${basePath}${key}`"
                                class="d-flex fill-height flex-column justify-center"
                            >
                                <v-card-item>
                                    <v-card-title class="mb-1">{{ technique.name }}</v-card-title>
                                    <v-card-subtitle>{{ technique.description }}</v-card-subtitle>
                                </v-card-item>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-container>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup>
import { computed, onMounted } from "vue"
import { useRouter } from "vue-router"

import { useJobStore } from "@/stores/job"
import { useUserStore } from "@/stores/user"

const props = defineProps({
    tools: {
        required: true,
        type: Object
    }
})

const router = useRouter()
const job = useJobStore()
const user = useUserStore()

const basePath = import.meta.env.VITE_BASE_PATH
const dashboardTitle = import.meta.env.VITE_DASHBOARD_TITLE

const availableTechniques = computed(() => {
    const techniques = {}

    for (const [key, value] of Object.entries(props.tools)) {
        if (key !== "generic-tools") {
            techniques[key] = value
        }
    }

    return techniques
})

onMounted(async () => {
    if (user.is_logged_in) {
        job.startMonitor(false, null, false)

        const lastpath = window.localStorage.getItem("lastpath")
        const redirect = window.localStorage.getItem("redirect")

        if (lastpath !== null && redirect === "true") {
            // The user has just logged in, so we need to redirect them to the last page they were on.
            window.localStorage.removeItem("lastpath")
            window.localStorage.removeItem("redirect")

            router.push(lastpath)
        }
    } else {
        window.localStorage.removeItem("lastpath")
        window.localStorage.setItem("redirect", true)
    }
})
</script>
