import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig, devices } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Read VITE_BASE_PATH from .env.user-interface (the same file Vite loads for
// `--mode user-interface`) so the suite's baseURL can never drift from the app's own base path.
function readBasePath() {
    const envPath = path.resolve(__dirname, "../../.env.user-interface")
    const envFile = fs.readFileSync(envPath, "utf8")
    const match = envFile
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("VITE_BASE_PATH="))

    return match ? match.split("=")[1].trim() : "/"
}

const PORT = 5173
const baseURL = `http://localhost:${PORT}${readBasePath()}`

// eslint-disable-next-line no-undef
const isCI = !!process.env.CI

// https://playwright.dev/docs/test-configuration
export default defineConfig({
    testDir: "./tests",
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    reporter: isCI ? [["html", { open: "never" }], ["list"]] : "list",
    use: {
        baseURL,
        trace: "on-first-retry"
    },
    webServer: {
        // Invoke vite directly (not via `pnpm run dev --`) - pnpm forwards the literal "--"
        // token through to the underlying script rather than stripping it, which makes vite
        // treat everything after it as positional args and silently ignore --mode/--port.
        command: "pnpm exec vite --mode user-interface --port 5173 --strictPort",
        url: baseURL,
        reuseExistingServer: !isCI,
        stdout: "pipe",
        timeout: 30000
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ]
})
