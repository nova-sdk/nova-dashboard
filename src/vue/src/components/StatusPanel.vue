<template>
    <v-menu
        :close-on-content-click="false"
        location="bottom center"
        max-width="600"
        min-width="0"
        open-on-hover
    >
        <template v-slot:activator="{ props }">
            <v-banner
                v-bind="props"
                :bg-color="AlertManager.statusColor(bannerStatus)"
                class="cursor-pointer justify-center py-0"
            >
                {{ AlertManager.statusMessage(bannerStatus) }}
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
                    <ServiceStatus v-for="service in alertManager.services" :service="service" />
                </v-list>
            </v-card-text>
        </v-card>
    </v-menu>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"
import AlertManager from "@/assets/js/alerts"
import ServiceStatus from "@/components/ServiceStatus.vue"

const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS

// reactive() (not a plain `new AlertManager()`) so that in-place mutations to its nested
// Service objects (see assets/js/alerts.js's reset()/update()) are tracked deeply - without
// it, ServiceStatus child components never re-render when a nested service's countText/
// status changes, since their `service` prop keeps the same object reference.
const alertManager = reactive(new AlertManager())
const bannerStatus = ref("success")
let pollInterval = null

const showBanner = computed(() => {
    return bannerStatus.value !== "unavailable"
})

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
