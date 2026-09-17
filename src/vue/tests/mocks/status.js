/**
 * Mocks GET /api/status/targets|alerts/ (src/vue/src/assets/js/alerts.js), polled every 5s
 * by StatusPanel.vue. Response shapes match StatusManager.process_prometheus_targets/alerts
 * (src/launcher_app/status.py).
 *
 * AlertManager builds two parallel groupings from "compute"-group targets:
 *  - services.compute: one leaf row per target.alias (a compute node), status from alerts
 *    whose `alias` matches that node.
 *  - services.instrument_data: one row per target.alias (the same compute nodes), each with
 *    a fixed set of ~40 instrument-mount children. An alert reaches a specific mount only
 *    when its `alias` matches the compute node (first hop) AND its `host_alias` matches the
 *    mount name (second hop) - see Service.addAlert's two-level child-name matching.
 *
 * "infrastructure", "oncat", "live_data", "documentation" are flat services with no
 * children - any alert with a matching `group` flips their status directly.
 */

export const DEFAULT_TARGETS = [
    { alias: "sns-analysis1", group: "compute" },
    { alias: "hfir-analysis1", group: "compute" }
]

export async function mockStatus(page, { alerts = [], targets = DEFAULT_TARGETS } = {}) {
    await page.route("**/api/status/targets/", async (route) => {
        await route.fulfill({ json: targets })
    })
    await page.route("**/api/status/alerts/", async (route) => {
        await route.fulfill({ json: { alerts } })
    })
}

export async function mockStatusUnavailable(page) {
    await page.route("**/api/status/targets/", async (route) => route.abort("connectionrefused"))
    await page.route("**/api/status/alerts/", async (route) => route.abort("connectionrefused"))
}

export function flatServiceAlert(group, severity = "warning") {
    return {
        alias: "",
        host_alias: "",
        group,
        environment: "test",
        severity,
        subtitle: "",
        title: ""
    }
}

export function computeNodeAlert(nodeAlias, severity = "warning") {
    return {
        alias: nodeAlias,
        host_alias: "",
        group: "compute",
        environment: "test",
        severity,
        subtitle: "",
        title: ""
    }
}

export function instrumentMountAlert(nodeAlias, mount, severity = "warning") {
    return {
        alias: nodeAlias,
        host_alias: mount,
        group: "instrument_data",
        environment: "test",
        severity,
        subtitle: "",
        title: ""
    }
}
