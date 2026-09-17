<template>
    <span>{{ status_text }}</span>
    <v-menu v-if="is_slow" :close-on-content-click="false" max-width="400" open-on-hover>
        <template v-slot:activator="{ props }">
            <v-icon v-bind="props" class="mx-1" color="warning">mdi-information-outline</v-icon>
        </template>

        <v-card class="bg-white">
            <v-card-title>This is taking longer than usual</v-card-title>

            <v-card-text>
                <p class="mb-2">
                    If the system status banner at the top of the page shows errors, then please use
                    the "Report Issue" button in the header if your tool fails to launch.
                </p>

                <p>
                    Otherwise, the compute node may be updating your tool's Docker image to the
                    newest version of this application.
                </p>
            </v-card-text>
        </v-card>
    </v-menu>

    <v-progress-circular v-if="props?.state !== 'ok'" class="ml-1" indeterminate />
</template>

<script setup>
import { computed, onMounted, ref } from "vue"

const props = defineProps({
    name: {
        required: true,
        type: String
    },
    state: {
        required: true,
        type: String
    },
    url: {
        required: true,
        type: String
    },
    urlReady: {
        required: true,
        type: Boolean
    }
})

const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const status_text = computed(() => {
    if (props.state === "connecting") {
        return `Connecting to ${galaxyAlias}...`
    }

    if (props.state === "stopping") {
        return `Stopping application...`
    }

    if (props.url && !props.urlReady) {
        is_slow.value = false

        return `Waiting for application to respond...`
    }

    if (props.state === "ok") {
        is_slow.value = false

        return "Application ran successfully."
    }

    if (["new", "queued", "running"].includes(props.state) && !props.urlReady) {
        return `Initializing application...`
    }

    return `Launching application...`
})

const is_slow = ref(false)
onMounted(() => {
    // Wait until the job has been fully submitted to Galaxy before counting the time it takes to launch.
    const interval = setInterval(() => {
        // Give Galaxy 10 seconds to launch the Docker container before reporting it as slow to respond.
        setTimeout(() => {
            // If there is a URL, then the container started during this timeout.
            if (!props.url && props?.state !== "ok") {
                is_slow.value = true
            }
        }, 10000)
        clearInterval(interval)
    }, 100)
})
</script>
