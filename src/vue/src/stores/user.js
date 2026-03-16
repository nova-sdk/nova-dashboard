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
            delay: 2000,
            email: null,
            id: "",
            initial_login_failed: false,
            is_admin: false,
            is_logged_in: false,
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
            if (this.id === "") {
                return
            }

            const apiKeyResponse = await fetch(`/api/users/${this.id}/api_key/detailed`)
            const apiKeyData = await apiKeyResponse.json()
            this.apiKey = apiKeyData.key

            this.getAdmin()
        },
        async getUserId() {
            if (mockUserEmail && mockUserApiKey) {
                return
            }

            let userData
            try {
                const userResponse = await fetch("/api/whoami")
                userData = await userResponse.json()
            } catch {
                userData = null
            }
            if (userData === null) {
                // User is not logged in.
                if (this.id !== "") {
                    window.location.reload()
                }

                this.initial_login_failed = true
                this.ready = true
                return
            }
            this.email = userData.email

            if (this.initial_login_failed || (this.id !== "" && this.id !== userData.id)) {
                window.location.reload()
            }
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

            if (this.id === "") {
                window.setTimeout(() => {
                    this.getUser()
                }, this.delay)
            }
        },
        mockUserLogin() {
            this.email = mockUserEmail
            this.is_logged_in = true
            this.ready = true

            window.setTimeout(() => {
                this.apiKey = mockUserApiKey
                this.getAdmin()
            }, this.delay)
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
