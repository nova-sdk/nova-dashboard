<template>
    <v-menu activator="parent" :close-on-content-click="false" open-on-hover>
        <v-card width="600">
            <v-card-title class="mb-2 px-0">About This Dashboard</v-card-title>
            <v-card-text class="pa-0">
                <p class="mb-2">
                    The dashboard is currently running version {{ version }}.
                    <a :href="changelogUrl" target="_blank">View Changelog</a>
                </p>

                <p class="mb-2">
                    NOVA stands for Neutrons Open Visualization and Analysis Framework. This
                    dashboard is meant to serve as a way to launch and manage interactive
                    applications running in
                    <a :href="galaxyProjectUrl" target="_blank">Galaxy</a>.
                </p>

                <p>
                    This work was sponsored by the Laboratory Directed Research and Development
                    Program of Oak Ridge National Laboratory, managed by UT-Battelle, LLC, for the
                    U.S. Department of Energy.
                </p>
            </v-card-text>
        </v-card>
    </v-menu>
</template>

<script setup>
const changelogUrl = import.meta.env.VITE_CHANGELOG_URL
const galaxyProjectUrl = import.meta.env.VITE_GALAXY_PROJECT_URL
const version = import.meta.env.VITE_DASHBOARD_VERSION
</script>
