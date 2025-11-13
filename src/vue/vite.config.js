import fs from "node:fs"
import { fileURLToPath, URL } from "node:url"

import toml from "toml"

import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import vuetify from "vite-plugin-vuetify"

// https://vitejs.dev/config/
export default defineConfig(() => {
    const tomlData = fs.readFileSync("../../pyproject.toml", "utf8")
    const tomlObj = toml.parse(tomlData)
    const version = tomlObj.project.version

    // eslint-disable-next-line no-undef
    process.env = { ...process.env, VITE_DASHBOARD_VERSION: version }

    return {
        esbuild: {
            supported: {
                "top-level-await": true
            }
        },
        envDir: "../..",
        plugins: [vue(), vuetify()],
        resolve: {
            alias: {
                "@": fileURLToPath(new URL("./src", import.meta.url))
            }
        },
        server: {
            hmr: {
                clientPort: 5173
            }
        }
    }
})
