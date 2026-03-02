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
    const dashboardTitle = import.meta.env.VITE_DASHBOARD_TITLE
    const job = useJobStore()
    const response = await fetch("/api/galaxy/tools/")
    const toolResponse = await response.json()
    if (response.status === 500) {
        job.galaxy_error = toolResponse.error
    }
    tools = toolResponse.tools

    const router = createRouter({
        history: createWebHistory(import.meta.env.VITE_BASE_PATH), // This is html5 mode for Vue Router
        routes: [
            {
                path: "/",
                name: "home",
                component: HomeView,
                props: { tools }
            },
            {
                path: "/:category",
                name: "category",
                component: CategoryView,
                props: { tools }
            },
            {
                path: "/launch/:tool",
                name: "launch",
                component: LaunchView,
                props: { tools }
            },
            {
                path: "/:catchAll(.*)*",
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
