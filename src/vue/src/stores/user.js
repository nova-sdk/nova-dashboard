import { defineStore } from "pinia"

export const useUserStore = defineStore("user", {
    state: () => {
        return {
            apiKey: "",
            autoopen: false, // if true, tools will open in a new tab once they've successfully launched
            email: null,
            is_admin: false,
            is_logged_in: false,
            monitor_interval: null,
            login_type: "",
            ready: false
        }
    },
    actions: {
        async getUser() {
            const userResponse = await fetch("/api/whoami")
            const userData = await userResponse.json()
            if (userData === null) {
                // User is not logged in.
                return
            }
            this.email = userData.email
            this.is_logged_in = true

            const apiKeyResponse = await fetch(`/api/users/${userData.id}/api_key/detailed`)
            const apiKeyData = await apiKeyResponse.json()
            this.apiKey = apiKeyData.key
            this.ready = true

            // TODO
            // this.is_admin = await fetch(`${basePath}api/`)
        },
        getAutoopen() {
            this.autoopen = window.localStorage.getItem("autoopen") === "true"
        },
        toggleAutoopen() {
            this.autoopen = !this.autoopen
            window.localStorage.setItem("autoopen", this.autoopen)
        }
    }
})
