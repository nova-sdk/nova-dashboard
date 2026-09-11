const basePath = import.meta.env.VITE_BASE_PATH
const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS

const INSTRUMENT_MOUNTS = [
    "HFIR-CG1A",
    "HFIR-CG1B",
    "HFIR-CG1D",
    "HFIR-CG2",
    "HFIR-CG3",
    "HFIR-CG4B",
    "HFIR-CG4C",
    "HFIR-CG4D",
    "HFIR-HB1",
    "HFIR-HB1A",
    "HFIR-HB2A",
    "HFIR-HB2B",
    "HFIR-HB2C",
    "HFIR-HB3",
    "HFIR-HB3A",
    "HFIR-NOWG",
    "HFIR-NOWV",
    "SNS-ARCS",
    "SNS-BL0",
    "SNS-BSS",
    "SNS-CNCS",
    "SNS-CORELLI",
    "SNS-EQSANS",
    "SNS-FNPB",
    "SNS-HYS",
    "SNS-LENS",
    "SNS-MANDI",
    "SNS-NOM",
    "SNS-NOWB",
    "SNS-NOWD",
    "SNS-NOWG",
    "SNS-NOWW",
    "SNS-NOWX",
    "SNS-NSE",
    "SNS-PG3",
    "SNS-REF_L",
    "SNS-REF_M",
    "SNS-SEQ",
    "SNS-SNAP",
    "SNS-TOPAZ",
    "SNS-USANS",
    "SNS-VENUS",
    "SNS-VIS",
    "SNS-VULCAN"
]

// Tracks the status of a service.
class Service {
    constructor(name, children) {
        if (children === undefined) {
            children = []
        }

        this.alerts = []
        this.children = children.sort((a, b) => a.name.localeCompare(b.name))
        this.countText = ""
        this.name = name
        this.status = "success"
    }

    clone() {
        return new Service(this.name, this.children)
    }

    reset() {
        this.alerts = []
        this.countText = ""
        this.status = "success"

        for (const child of this.children) {
            child.reset()
        }
    }

    addAlert(alert) {
        this.alerts.push(alert)

        for (const child of this.children) {
            if (child.name === alert.alias || child.name === alert.host_alias) {
                child.addAlert(alert)
            }
        }
    }

    update() {
        for (const child of this.children) {
            child.update()
        }

        this.updateCountText()
        this.updateStatus()
    }

    updateCountText() {
        let childDownCount = 0
        for (const child of this.children) {
            if (child.status !== "success") {
                childDownCount++
            }
        }

        if (this.children.length === 0) {
            this.countText = ""
        } else {
            this.countText = ` (${this.children.length - childDownCount} of ${this.children.length} up)`
        }
    }

    updateStatus() {
        if (this.alerts.some((alert) => alert?.severity === "critical")) {
            this.status = "critical"
        } else if (this.alerts.some((alert) => alert?.severity === "warning")) {
            this.status = "warning"
        } else {
            this.status = "success"
        }
    }
}

// API class, this is responsible for interacting with the alert monitoring endpoint and triggering relevant state updates.
export default class AlertManager {
    constructor() {
        this.alertsUrl = `${basePath}api/status/alerts/`
        this.targetsUrl = `${basePath}api/status/targets/`

        this.alerts = []
        this.services = null
    }

    reset() {
        this.alerts = []
        for (const key in this.services) {
            this.services[key].reset()
        }
    }

    async initServices() {
        const response = await fetch(this.targetsUrl)
        const targets = await response.json()

        this.services = {
            infrastructure: new Service("Infrastructure"),
            idp: new Service("Authentication Services", await this.getSubservices(targets, "idp")),
            instrument_data: new Service(
                "Instrument Data",
                await this.getInstrumentAlerts(targets)
            ),
            oncat: new Service("ONCat"),
            compute: new Service(
                "Compute Resources",
                await this.getSubservices(targets, "compute")
            ),
            live_data: new Service("Live Data"),
            documentation: new Service("Documentation")
        }
    }

    async getSubservices(targets, key, children) {
        if (children === undefined) {
            children = []
        }

        const services = {}
        for (const target of targets) {
            // If we don't clone each child, then the class instance will be shared between each subservice.
            // That would cause an alert in one of the subservices to visually indicate an error in all of them.
            const subServiceChildren = children.map((child) => child.clone())
            if (target.group === key) {
                services[target.alias] = new Service(target.alias, subServiceChildren)
            }
        }

        return Object.values(services)
    }

    async getInstrumentAlerts(targets) {
        return this.getSubservices(
            targets,
            "compute",
            INSTRUMENT_MOUNTS.map((mount) => {
                return new Service(mount)
            })
        )
    }

    getStatus() {
        if (this.alerts.some((alert) => alert?.severity === "critical")) {
            return "critical"
        }

        if (this.alerts.some((alert) => alert?.severity === "warning")) {
            return "warning"
        }

        return "success"
    }

    async update() {
        if (this.services === null) {
            await this.initServices()
        }

        const response = await fetch(this.alertsUrl)
        const data = await response.json()

        this.reset()

        const alerts = data?.alerts || []
        for (const alert of alerts) {
            if (alert.group in this.services) {
                this.alerts.push(alert)
                this.services[alert.group].addAlert(alert)
            }
        }

        for (const key in this.services) {
            this.services[key].update()
        }
    }

    static statusColor(status) {
        if (status === "unavailable") {
            return "grey"
        }

        if (status === "critical") {
            return "error"
        }

        if (status === "warning") {
            return "warning"
        }

        return "success"
    }

    static statusIcon(status) {
        if (status === "critical") {
            return "mdi-close-circle"
        }

        if (status === "warning") {
            return "mdi-alert-circle"
        }

        return "mdi-check-circle"
    }

    static statusMessage(status) {
        if (status === "unavailable") {
            return `Unable to check ${galaxyAlias} status.`
        }

        if (status === "critical") {
            return `Some ${galaxyAlias} systems are experiencing outages. Hover for details.`
        }

        if (status === "warning") {
            return `Some ${galaxyAlias} systems are experiencing degraded performance. Hover for details.`
        }

        return `All ${galaxyAlias} systems are operating normally.`
    }
}
