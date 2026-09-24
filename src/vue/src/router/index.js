/*
 * This defines the routes for our single-page application.
 */

import { createRouter, createWebHistory } from "vue-router"

import { getTools as getGalaxyTools } from "../services/galaxyDirect"
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
    const galaxyUrl = import.meta.env.VITE_GALAXY_URL
    const job = useJobStore()
    try {
        tools = await getGalaxyTools()
    } catch (error) {
        // Mirrors the messages the removed Django `/api/galaxy/tools/` view returned.
        if (error instanceof SyntaxError) {
            job.galaxy_error = `Unable to fetch tool list, ${galaxyUrl} may be restarting.`
        } else if (error instanceof TypeError || error.status === 502) {
            job.galaxy_error = `Unable to connect to Galaxy, ${galaxyUrl} may be restarting.`
        } else {
            job.galaxy_error = error.message
        }
        tools = {}
    }

    const router = createRouter({
        history: createWebHistory(), // This is html5 mode for Vue Router
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
