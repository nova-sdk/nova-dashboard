"use strict";

/**
 * Shared hooks for the dashboard's Artillery scenarios.
 *
 * Everything here is deliberately defensive: a load run against a broken or
 * misconfigured deployment should produce a useful metric rather than a crashed
 * virtual user, so hooks swallow parse errors and record them as counters.
 */

// Trailing-slash-normalized app base path. The front end builds every API URL as
// `${VITE_BASE_PATH}api/...`, so the load test has to use the same prefix.
const DEFAULT_BASE_PATH = process.env.LOAD_BASE_PATH || "/";
// Responses slower than this are counted separately; the ensure thresholds in the
// YAML files cover the aggregate, this one tells you *which* endpoint was slow.
const SLOW_MS = Number(process.env.LOAD_SLOW_MS || 1000);

function normalizeBasePath(value) {
  let base = value || "/";
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (!base.endsWith("/")) {
    base = `${base}/`;
  }
  return base;
}

function originOf(context) {
  return context.vars.target || process.env.LOAD_TARGET || "";
}

function parseJson(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}

/** Seeds per-VU variables. Registered as a `beforeScenario` hook. */
function setDefaults(context, events, done) {
  context.vars.base = normalizeBasePath(DEFAULT_BASE_PATH);
  context.vars.galaxyApiKey = process.env.LOAD_GALAXY_API_KEY || "";
  context.vars.galaxyHistoryName =
    process.env.LOAD_GALAXY_HISTORY_NAME || "launcher_history";
  context.vars.csrftoken = "";
  return done();
}

/**
 * Django sets the CSRF cookie on the vuetify_config response (it is the only view
 * wearing @ensure_csrf_cookie). The issue form reads it from the cookie and echoes
 * it back in X-CSRFToken, so the load test has to do the same or every POST is a 403.
 */
function captureCsrfToken(request, response, context, events, done) {
  const setCookie = response.headers?.["set-cookie"] || [];
  for (const cookie of Array.isArray(setCookie) ? setCookie : [setCookie]) {
    const match = /csrftoken=([^;]+)/.exec(cookie);
    if (match) {
      context.vars.csrftoken = match[1];
    }
  }
  return done();
}

/** Attaches the CSRF header and a trusted Referer (Django requires it over HTTPS). */
function addCsrfHeaders(requestParams, context, events, done) {
  requestParams.headers = {
    ...(requestParams.headers || {}),
    "X-CSRFToken": context.vars.csrftoken || "",
    Referer: originOf(context),
  };
  return done();
}

function endpointLabel(request) {
  const url = request.url || "";
  return url.replace(/^https?:\/\/[^/]+/, "").split("?")[0] || "/";
}

/** Flags responses over SLOW_MS. Artillery already reports aggregate times; this says where. */
function observeTiming(request, response, events) {
  if (response.timings?.phases?.total > SLOW_MS) {
    events.emit("counter", `slow.${endpointLabel(request)}`, 1);
  }
}

/** Counts a non-2xx/3xx status against its endpoint. */
function observeStatus(request, response, events) {
  if (response.statusCode >= 400) {
    events.emit(
      "counter",
      `status_errors.${endpointLabel(request)}.${response.statusCode}`,
      1,
    );
  }
}

/** Default afterResponse hook: timing plus status accounting. */
function recordResponse(request, response, context, events, done) {
  observeTiming(request, response, events);
  observeStatus(request, response, events);
  return done();
}

/**
 * Validates GET /api/status/alerts/ and records how much Prometheus data the view
 * had to chew through. Payload size matters here: process_prometheus_alerts filters
 * the *entire* Prometheus alert list in Python on every single request.
 */
function checkAlerts(request, response, context, events, done) {
  observeTiming(request, response, events);
  observeStatus(request, response, events);

  const data = parseJson(response);
  if (data === null || !Array.isArray(data.alerts)) {
    events.emit("counter", "alerts.malformed_response", 1);
    return done();
  }

  events.emit("histogram", "alerts.returned", data.alerts.length);
  events.emit(
    "histogram",
    "alerts.payload_bytes",
    Buffer.byteLength(response.body || ""),
  );

  const critical = data.alerts.filter(
    (alert) => alert.severity === "critical",
  ).length;
  if (critical > 0) {
    events.emit("counter", "alerts.critical_seen", critical);
  }

  return done();
}

/** Validates GET /api/status/targets/ (a bare JSON array) the same way. */
function checkTargets(request, response, context, events, done) {
  observeTiming(request, response, events);
  observeStatus(request, response, events);

  const data = parseJson(response);
  if (!Array.isArray(data)) {
    events.emit("counter", "targets.malformed_response", 1);
    return done();
  }

  events.emit("histogram", "targets.returned", data.length);
  return done();
}

/**
 * The issue endpoint rejects unknown Galaxy API keys with 400 before it ever
 * reaches GitLab, so an unauthenticated POST is a safe way to load the Galaxy
 * round trip. A 200 here means a real GitLab issue was just filed.
 */
function checkIssueRejected(request, response, context, events, done) {
  // Only the timing is interesting: the 400 is the point of this scenario, so it
  // must not land in status_errors and look like a failure.
  observeTiming(request, response, events);

  if (response.statusCode === 200) {
    events.emit("counter", "issue.unexpectedly_created", 1);
    console.warn(
      "WARNING: POST /api/issue/ returned 200 during the auth-rejection scenario. " +
        "A real GitLab issue may have been created.",
    );
  } else if (response.statusCode !== 403) {
    events.emit("counter", "issue.unexpected_status", 1);
  } else {
    events.emit("counter", "issue.rejected_as_expected", 1);
  }

  return done();
}

/**
 * Validates Galaxy's tool panel response. Galaxy answers an expired or invalid
 * session with an HTML login page rather than a 4xx, so a JSON check is the only
 * reliable signal that the request actually did tool-panel work.
 */
function checkToolPanel(request, response, context, events, done) {
  observeTiming(request, response, events);
  observeStatus(request, response, events);

  const data = parseJson(response);
  if (!Array.isArray(data)) {
    events.emit("counter", "galaxy.tool_panel_not_json", 1);
    return done();
  }

  const prefix = process.env.LOAD_TOOL_PREFIX || "nova";
  let sections = 0;
  let dashboardTools = 0;
  for (const section of data) {
    sections += 1;
    for (const tool of section.elems || []) {
      if ((tool.id || "").trim().startsWith(prefix)) {
        dashboardTools += 1;
      }
    }
  }

  events.emit("histogram", "galaxy.tool_panel_sections", sections);
  events.emit("histogram", "galaxy.dashboard_tools", dashboardTools);
  events.emit(
    "histogram",
    "galaxy.tool_panel_bytes",
    Buffer.byteLength(response.body || ""),
  );

  return done();
}

/** Adds the Galaxy API key header to a request (the CLI equivalent of the browser's session cookie). */
function addGalaxyAuth(requestParams, context, events, done) {
  if (!context.vars.galaxyApiKey) {
    return done();
  }
  requestParams.headers = {
    ...(requestParams.headers || {}),
    "x-api-key": context.vars.galaxyApiKey,
  };
  return done();
}

/**
 * Predicates for `ifTrue`. Artillery calls these with the VU's vars and skips the
 * step when they return false. They are used instead of filtrex expressions because
 * filtrex throws on an uncaptured (undefined) variable, and Artillery treats a
 * throwing condition as "true" - which would fire a request at an undefined URL.
 */
function hasGalaxyKey(vars) {
  return Boolean(vars.galaxyApiKey);
}

function hasHistoryId(vars) {
  return Boolean(vars.historyId);
}

function hasJobId(vars) {
  return Boolean(vars.jobId);
}

function hasJsBundle(vars) {
  return Boolean(vars.jsBundle);
}

function hasCssBundle(vars) {
  return Boolean(vars.cssBundle);
}

/** Pulls the dashboard history id out of GET /api/histories so job polling can use it. */
function captureHistoryId(request, response, context, events, done) {
  observeTiming(request, response, events);
  observeStatus(request, response, events);

  const histories = parseJson(response);
  if (!Array.isArray(histories)) {
    events.emit("counter", "galaxy.histories_not_json", 1);
    context.vars.historyId = "";
    return done();
  }

  const match = histories.find(
    (history) => history.name === context.vars.galaxyHistoryName,
  );
  context.vars.historyId = match ? match.id : "";
  if (!match) {
    events.emit("counter", "galaxy.history_missing", 1);
  }

  return done();
}

module.exports = {
  addCsrfHeaders,
  addGalaxyAuth,
  captureCsrfToken,
  captureHistoryId,
  checkAlerts,
  checkIssueRejected,
  checkTargets,
  checkToolPanel,
  hasCssBundle,
  hasGalaxyKey,
  hasHistoryId,
  hasJobId,
  hasJsBundle,
  recordResponse,
  setDefaults,
};
