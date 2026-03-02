/*
 * This defines the routes for our single-page application.
 */

import { createRouter, createWebHistory } from "vue-router"

import { useJobStore } from "../stores/job"
import CategoryView from "../views/CategoryView.vue"
import LaunchView from "../views/LaunchView.vue"
import HomeView from "../views/HomeView.vue"
import NotFoundView from "../views/NotFoundView.vue"

let tools = {}

export function getTools() {
    return tools
}

export default async function initRouter() {
    const basePath = import.meta.env.VITE_BASE_PATH
    const dashboardTitle = import.meta.env.VITE_DASHBOARD_TITLE
    const job = useJobStore()
    const response = await fetch(`${basePath}api/galaxy/tools/`)
    const toolResponse = await response.json()
    if (response.status === 500) {
        job.galaxy_error = toolResponse.error
    }
    tools = toolResponse.tools

    const router = createRouter({
        history: createWebHistory(import.meta.env.VITE_BASE_PATH), // This is html5 mode for Vue Router
        routes: [
            {
                path: basePath,
                name: "home",
                component: HomeView,
                props: { tools }
            },
            {
                path: `${basePath}:category`,
                name: "category",
                component: CategoryView,
                props: { tools }
            },
            {
                path: `${basePath}launch/:tool`,
                name: "launch",
                component: LaunchView,
                props: { tools }
            },
            {
                path: `${basePath}:catchAll(.*)*`,
                name: "not-found",
                component: NotFoundView
            }
        ]
    })

    router.afterEach(() => {
        window.document.title = dashboardTitle
    })

    return router
}
