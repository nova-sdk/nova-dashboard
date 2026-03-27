<!-- Creates a popover VMenu for viewing all currently active tools in Galaxy. -->
<template>
    <v-menu
        v-if="props.toolList.length > 0"
        :close-on-content-click="false"
        activator="parent"
        max-width="1200"
    >
        <v-card>
            <v-card-title>Active Tools</v-card-title>

            <v-list>
                <ToolListItem
                    v-for="(data, index) in props.toolList"
                    :key="index"
                    :tool="data.tool"
                    :job="data.job"
                />
            </v-list>
        </v-card>
    </v-menu>
</template>

<script setup>
import ToolListItem from "@/components/ToolListItem.vue"

const props = defineProps({
    toolList: {
        required: true,
        type: Object
    }
})
</script>

<style scoped>
.v-badge:deep(.v-badge__badge) {
    letter-spacing: 0;
}
</style>
