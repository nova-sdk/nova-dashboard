<template>
    <v-menu activator="parent" :close-on-content-click="false">
        <v-list>
            <v-list-item :href="novaDocsUrl" target="_blank">
                {{ novaAlias }} Documentation
            </v-list-item>
            <v-list-item :href="novaTutorialUrl" target="_blank">
                {{ novaAlias }} Tutorial
            </v-list-item>
            <v-list-item :href="galaxyDocsUrl" target="_blank"> Admin Guide </v-list-item>
        </v-list>
    </v-menu>
</template>

<script setup>
const galaxyDocsUrl = import.meta.env.VITE_GALAXY_DOCS_URL
const novaAlias = import.meta.env.VITE_NOVA_ALIAS
const novaDocsUrl = import.meta.env.VITE_NOVA_DOCS_URL
const novaTutorialUrl = import.meta.env.VITE_NOVA_TUTORIAL_URL
</script>
