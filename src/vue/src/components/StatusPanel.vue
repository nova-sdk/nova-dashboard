<template>
    <v-menu
        :close-on-content-click="false"
        location="bottom center"
        max-width="400"
        min-width="0"
        open-on-hover
    >
        <template v-slot:activator="{ props }">
            <v-banner
                v-bind="props"
                :bg-color="statusColor(bannerStatus)"
                class="cursor-pointer justify-center py-0"
            >
                {{ statusMessage(bannerStatus) }}
            </v-banner>
        </template>
        <v-card v-if="showBanner">
            <v-card-title class="mb-2 px-0">{{ galaxyAlias }} System Status</v-card-title>
            <v-card-subtitle v-if="alertManager.monitoringUrl">
                <v-btn :href="alertManager.monitoringUrl" target="_blank">
                    View Monitoring Details
                </v-btn>
            </v-card-subtitle>
            <v-card-text class="pa-0">
                <v-list>
                    <div v-for="service in alertManager.services">
                        <v-list-group v-if="service.countText">
                            <template v-slot:activator="{ props }">
                                <v-list-item v-bind="props" class="bg-white border-none">
                                    <template v-slot:prepend>
                                        <v-icon :color="statusColor(service.status)">
                                            {{ statusIcon(service.status) }}
                                        </v-icon>
                                    </template>

                                    <v-list-item-title>
                                        {{ service.name }}{{ service.countText }}
                                    </v-list-item-title>
                                </v-list-item>
                            </template>

                            <v-list-item
                                v-for="alias in service.aliases"
                                class="bg-white border-none"
                            >
                                <template v-slot:prepend>
                                    <v-icon :color="statusColor(alias.status)">
                                        {{ statusIcon(alias.status) }}
                                    </v-icon>
                                </template>

                                {{ alias.name }}
                            </v-list-item>
                        </v-list-group>
                        <v-list-item v-else class="bg-white border-none">
                            <template v-slot:prepend>
                                <v-icon :color="statusColor(service.status)">
                                    {{ statusIcon(service.status) }}
                                </v-icon>
                            </template>

                            <v-list-item-title>
                                {{ service.name }}
                            </v-list-item-title>
                        </v-list-item>
                    </div>
                </v-list>
            </v-card-text>
        </v-card>
    </v-menu>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import AlertManager from "@/assets/js/alerts"

const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const alertManager = new AlertManager()
const bannerStatus = ref("success")
let pollInterval = null

const showBanner = computed(() => {
    return bannerStatus.value !== "unavailable"
})

const statusColor = (status) => {
    if (status === "unavailable") {
        return "grey"
    }

    if (status === "critical") {
        return "error"
    }

    if (status === "warning") {
        return "warning"
    }

    return "success"
}

const statusIcon = (status) => {
    if (status === "critical") {
        return "mdi-close-circle"
    }

    if (status === "warning") {
        return "mdi-alert-circle"
    }

    return "mdi-check-circle"
}

const statusMessage = (status) => {
    if (status === "unavailable") {
        return `Unable to check ${galaxyAlias} status.`
    }

    if (status === "critical") {
        return `Some ${galaxyAlias} systems are experiencing outages. Hover for details.`
    }

    if (status === "warning") {
        return `Some ${galaxyAlias} systems are experiencing degraded performance. Hover for details.`
    }

    return `All ${galaxyAlias} systems are operating normally.`
}

const checkStatus = async () => {
    try {
        await alertManager.update()
        bannerStatus.value = alertManager.getStatus()
    } catch (error) {
        bannerStatus.value = "unavailable"
        console.error(`Failed to retrieve ${galaxyAlias} system status:`, error)
    }
}

onMounted(() => {
    checkStatus()
    pollInterval = setInterval(checkStatus, 5000)
})

onBeforeUnmount(() => {
    clearInterval(pollInterval)
})
</script>
