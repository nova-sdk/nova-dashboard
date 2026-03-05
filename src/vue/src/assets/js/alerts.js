const basePath = import.meta.env.VITE_BASE_PATH

// Tracks the status of an individual alert alias.
class Alias {
    constructor(name) {
        this.name = name
        this.status = "success"
    }

    reset() {
        this.status = "success"
    }

    setStatus(alert) {
        if (alert.severity === "critical") {
            this.status = alert.severity
        } else if (alert.severity === "warning" && this.status !== "critical") {
            this.status = alert.severity
        }
    }
}

const INSTRUMENT_ALIASES = [
    new Alias("HFIR-CG1A"),
    new Alias("HFIR-CG1B"),
    new Alias("HFIR-CG1D"),
    new Alias("HFIR-CG2"),
    new Alias("HFIR-CG3"),
    new Alias("HFIR-CG4B"),
    new Alias("HFIR-CG4C"),
    new Alias("HFIR-CG4D"),
    new Alias("HFIR-HB1"),
    new Alias("HFIR-HB1A"),
    new Alias("HFIR-HB2A"),
    new Alias("HFIR-HB2B"),
    new Alias("HFIR-HB2C"),
    new Alias("HFIR-HB3"),
    new Alias("HFIR-HB3A"),
    new Alias("HFIR-NOWG"),
    new Alias("HFIR-NOWV"),
    new Alias("SNS-ARCS"),
    new Alias("SNS-BL0"),
    new Alias("SNS-BSS"),
    new Alias("SNS-CNCS"),
    new Alias("SNS-CORELLI"),
    new Alias("SNS-EQSANS"),
    new Alias("SNS-FNPB"),
    new Alias("SNS-HYS"),
    new Alias("SNS-LENS"),
    new Alias("SNS-MANDI"),
    new Alias("SNS-NOM"),
    new Alias("SNS-NOWB"),
    new Alias("SNS-NOWD"),
    new Alias("SNS-NOWG"),
    new Alias("SNS-NOWW"),
    new Alias("SNS-NOWX"),
    new Alias("SNS-NSE"),
    new Alias("SNS-PG3"),
    new Alias("SNS-REF_L"),
    new Alias("SNS-REF_M"),
    new Alias("SNS-SEQ"),
    new Alias("SNS-SNAP"),
    new Alias("SNS-TOPAZ"),
    new Alias("SNS-USANS"),
    new Alias("SNS-VENUS"),
    new Alias("SNS-VIS"),
    new Alias("SNS-VULCAN")
]

// Tracks the status of a service.
class Service {
    constructor(name, aliases) {
        if (aliases === undefined) {
            aliases = []
        }

        this.alerts = []
        this.aliases = aliases.sort((a, b) => a.name.localeCompare(b.name))
        this.countText = ""
        this.name = name
        this.status = "success"
    }

    reset() {
        this.alerts = []
        this.countText = ""
        this.status = "success"

        for (const alias of this.aliases) {
            alias.reset()
        }
    }

    addAlert(alert) {
        this.alerts.push(alert)

        for (const alias of this.aliases) {
            if (alias.name === alert.alias) {
                alias.setStatus(alert)
            }
        }
    }

    update() {
        this.updateCountText()
        this.updateStatus()
    }

    updateCountText() {
        let aliasDownCount = 0
        for (const alias of this.aliases) {
            if (alias.status !== "success") {
                aliasDownCount++
            }
        }

        if (this.aliases.length === 0) {
            this.countText = ""
        } else {
            this.countText = ` (${this.aliases.length - aliasDownCount} of ${this.aliases.length} up)`
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
        this.services = {
            infrastructure: new Service("Infrastructure"),
            instrument_data: new Service("Instrument Data", INSTRUMENT_ALIASES),
            oncat: new Service("ONCat"),
            compute: new Service("Compute Resources", await this.getAliases("compute")),
            live_data: new Service("Live Data"),
            documentation: new Service("Documentation")
        }
    }

    async getAliases(key) {
        const response = await fetch(this.targetsUrl)
        const targets = await response.json()

        const aliases = {}
        for (const target of targets) {
            if (target.group === key) {
                aliases[target.alias] = new Alias(target.alias)
            }
        }

        return Object.values(aliases)
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
}
