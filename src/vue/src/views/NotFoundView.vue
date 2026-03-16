<template>
    <v-container class="align-center d-flex h-100 justify-center" fluid>
        <v-card class="text-center" max-width="400">
            <v-banner v-if="job.galaxy_error" class="bg-error">
                {{ job.galaxy_error }}
            </v-banner>
            <v-card-text v-else>
                <p class="mb-4">The content you requested could not be found.</p>
                <v-btn to="/">Home</v-btn>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup>
import { useJobStore } from "@/stores/job"

const job = useJobStore()
</script>
