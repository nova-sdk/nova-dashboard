import { defineStore } from "pinia"

const mockUserEmail = import.meta.env.VITE_MOCK_USER_EMAIL
const mockUserApiKey = import.meta.env.VITE_MOCK_USER_API_KEY

export const useUserStore = defineStore("user", {
    state: () => {
        return {
            apiKey: "",
            autoopen: false, // if true, tools will open in a new tab once they've successfully launched
            email: null,
            is_admin: false,
            is_logged_in: false,
            monitor_interval: null,
            ready: false
        }
    },
    actions: {
        mockUserLogin() {
            this.email = mockUserEmail
            this.is_logged_in = true
            this.ready = true

            window.setTimeout(() => {
                this.apiKey = mockUserApiKey
            })
        },
        async getUser() {
            if (mockUserEmail && mockUserApiKey) {
                this.mockUserLogin()
                return
            }

            const userResponse = await fetch("/api/whoami")
            const userData = await userResponse.json()
            if (userData === null) {
                // User is not logged in.
                this.ready = true
                return
            }
            this.email = userData.email
            this.is_logged_in = true
            this.ready = true

            const apiKeyResponse = await fetch(`/api/users/${userData.id}/api_key/detailed`)
            const apiKeyData = await apiKeyResponse.json()
            this.apiKey = apiKeyData.key

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
