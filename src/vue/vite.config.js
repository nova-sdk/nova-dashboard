import fs from "node:fs"
import { fileURLToPath, URL } from "node:url"

import toml from "toml"

import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"
import vuetify from "vite-plugin-vuetify"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const tomlData = fs.readFileSync("../../pyproject.toml", "utf8")
    const tomlObj = toml.parse(tomlData)
    const version = tomlObj.project.version

    // eslint-disable-next-line no-undef
    process.env = { ...process.env, VITE_DASHBOARD_VERSION: version }

    // eslint-disable-next-line no-undef
    const envFile = loadEnv(mode, `${process.cwd()}/../..`, "")

    return {
        base: envFile.VITE_BASE_PATH,
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
