import Cookies from "js-cookie"
import { defineStore } from "pinia"

const basePath = import.meta.env.VITE_BASE_PATH
const mockUserEmail = import.meta.env.VITE_MOCK_USER_EMAIL
const mockUserApiKey = import.meta.env.VITE_MOCK_USER_API_KEY

export const useUserStore = defineStore("user", {
    state: () => {
        return {
            apiKey: "",
            autoopen: false, // if true, tools will open in a new tab once they've successfully launched
            email: null,
            id: "",
            is_admin: false,
            is_logged_in: false,
            monitor_interval: null,
            ready: false
        }
    },
    actions: {
        async getAdmin() {
            const adminResponse = await fetch(`${basePath}api/galaxy/is_admin/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": Cookies.get("csrftoken")
                },
                body: JSON.stringify({
                    api_key: this.apiKey
                })
            })
            const adminData = await adminResponse.json()
            this.is_admin = adminData.is_admin
        },
        async getApiKey() {
            const apiKeyResponse = await fetch(`/api/users/${this.id}/api_key/detailed`)
            const apiKeyData = await apiKeyResponse.json()
            this.apiKey = apiKeyData.key

            this.getAdmin()
        },
        async getUserId() {
            const userResponse = await fetch("/api/whoami")
            const userData = await userResponse.json()
            if (userData === null) {
                // User is not logged in.
                this.ready = true
                return
            }
            this.email = userData.email
            this.id = userData.id
            this.is_logged_in = true
            this.ready = true
        },
        async getUser() {
            if (mockUserEmail && mockUserApiKey) {
                this.mockUserLogin()
            } else {
                await this.getUserId()
                this.getApiKey()
            }
        },
        mockUserLogin() {
            this.email = mockUserEmail
            this.is_logged_in = true
            this.ready = true

            window.setTimeout(() => {
                this.apiKey = mockUserApiKey
                this.getAdmin()
            })
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
