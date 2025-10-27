import { defineStore } from "pinia"

export const useUserStore = defineStore("user", {
    state: () => {
        return {
            autoopen: false, // if true, tools will open in a new tab once they've successfully launched
            checking_galaxy_login: false,
            given_name: null,
            is_admin: false,
            is_logged_in: false,
            auth_urls: [],
            requires_galaxy_login: false,
            monitor_interval: null,
            login_type: "",
            ready: false
        }
    },
    actions: {
        async getUser() {
            const response = await fetch("/api/auth/user/")
            const data = await response.json()

            this.given_name = data.given_name
            this.is_admin = data.is_admin
            this.is_logged_in = data.is_logged_in && !this.requires_galaxy_login
            this.auth_urls = data.auth_urls
            this.ready = true
        },
        async userStatus() {
            this.checking_galaxy_login = true

            const response = await fetch("/api/galaxy/user_status/")
            const data = await response.json()

            if (response.status == 450) {
                this.is_logged_in = false
                this.requires_galaxy_login = true
                this.login_type = data["auth_type"]

                if (this.monitor_interval === null) {
                    this.userMonitorLogin()
                }
            } else {
                this.is_logged_in = true
                this.requires_galaxy_login = false

                this.monitor_interval = null

                window.localStorage.removeItem("lastpath")
                window.localStorage.removeItem("redirect", false)
            }

            this.checking_galaxy_login = false
        },
        userMonitorLogin() {
            this.monitor_interval = setInterval(() => {
                if (this.requires_galaxy_login) {
                    this.userStatus()
                } else {
                    return
                }
            }, 2000)
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
