<!-- Defines the content when the user is viewing a category's tool list. -->
<template>
    <v-breadcrumbs v-if="category !== null">
        <v-breadcrumbs-item :to="basePath">Home</v-breadcrumbs-item>
        <v-breadcrumbs-divider />
        <v-breadcrumbs-item>{{ category.name }}</v-breadcrumbs-item>
    </v-breadcrumbs>

    <v-container v-if="category !== null" class="align-start d-flex justify-center">
        <v-card width="800">
            <v-card-title class="text-center">{{ category.name }} Applications</v-card-title>
            <v-card-subtitle v-if="!user.is_logged_in">
                The below tools are currently supported for running on Calvera. You must be signed
                in to launch them. You may sign in using the button in the top right corner of this
                page.
            </v-card-subtitle>

            <v-card-text>
                <v-banner v-if="galaxy_error" class="bg-error text-center">
                    {{ galaxy_error }}
                </v-banner>

                <v-list>
                    <v-list-subheader v-if="category.tools.length > 0">
                        {{ category.name }} Tools
                    </v-list-subheader>
                    <v-list-subheader v-else class="justify-center">
                        Stay tuned, we will be adding technique-specific tools here soon!
                    </v-list-subheader>

                    <ToolListItem
                        v-for="(tool, index) in category.tools"
                        :key="index"
                        :tool="tool"
                        class="pa-2"
                    />
                </v-list>

                <v-list v-if="category?.prototype_tools?.length > 0">
                    <v-list-subheader>Prototype Tools</v-list-subheader>

                    <ToolListItem
                        v-for="(tool, index) in category.prototype_tools"
                        :key="index"
                        :tool="tool"
                        class="pa-2"
                    />
                </v-list>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup>
import { onMounted, ref } from "vue"
import { storeToRefs } from "pinia"
import { useRoute, useRouter } from "vue-router"

import ToolListItem from "@/components/ToolListItem.vue"
import { useJobStore } from "@/stores/job"
import { useUserStore } from "@/stores/user"

const props = defineProps({
    tools: {
        required: true,
        type: Object
    }
})
const route = useRoute()
const router = useRouter()

const job = useJobStore()
const { galaxy_error } = storeToRefs(job)
const user = useUserStore()
const category = ref(null)

const basePath = import.meta.env.VITE_BASE_PATH

onMounted(async () => {
    if (route.params.category in props.tools) {
        category.value = props.tools[route.params.category]
    } else {
        router.replace({
            name: "not-found",
            params: { catchAll: route.path.substring(1).split("/") }
        })
    }

    job.startMonitor(true, null, false)
    if (!user.is_logged_in) {
        window.localStorage.setItem("lastpath", route.path)
        window.localStorage.setItem("redirect", true)
    }
})
</script>
