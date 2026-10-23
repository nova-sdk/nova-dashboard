"use strict";

/**
 * Turns an Artillery JSON result file into a single self-contained HTML report.
 *
 * `artillery report` was removed in Artillery v2 (reporting moved to Artillery
 * Cloud), so this is the local replacement: it reads the same `-o results.json`
 * file and writes an HTML file with no external assets, so it can be opened
 * offline or attached to a ticket.
 *
 *   node report.js results.json            # -> results.html
 *   node report.js results.json -o run.html
 *   node report.js results.json --p95 2000 --p99 4000
 *
 * The p95/p99 options only control the pass/fail chips on the summary tiles;
 * they default to the `ensure` thresholds in `artillery.yml`.
 */

const fs = require("node:fs");
const path = require("node:path");

// Defaults mirror `config.ensure` in artillery.yml.
const DEFAULT_P95_MS = 1500;
const DEFAULT_P99_MS = 3000;

const ENDPOINT_TIME_PREFIX = "plugins.metrics-by-endpoint.response_time.";
const ENDPOINT_CODE_PREFIX = "plugins.metrics-by-endpoint.";

function parseArgs(argv) {
  const opts = { input: null, output: null, p95: DEFAULT_P95_MS, p99: DEFAULT_P99_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--output") {
      opts.output = argv[++i];
    } else if (arg === "--p95") {
      opts.p95 = Number(argv[++i]);
    } else if (arg === "--p99") {
      opts.p99 = Number(argv[++i]);
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!opts.input) {
      opts.input = arg;
    }
  }
  opts.input = opts.input || "results.json";
  opts.output = opts.output || opts.input.replace(/\.json$/i, "") + ".html";
  return opts;
}

/* -------------------------------------------------------------------------- */
/* Shaping the Artillery result into the model the page renders               */
/* -------------------------------------------------------------------------- */

function sumByPrefix(counters, prefix) {
  return Object.entries(counters)
    .filter(([key]) => key.startsWith(prefix))
    .reduce((total, [, value]) => total + value, 0);
}

/** Per-endpoint latency, joined with that endpoint's response codes. */
function endpointRows(aggregate) {
  const counters = aggregate.counters || {};
  const summaries = aggregate.summaries || {};

  return Object.entries(summaries)
    .filter(([key]) => key.startsWith(ENDPOINT_TIME_PREFIX))
    .map(([key, stats]) => {
      const name = key.slice(ENDPOINT_TIME_PREFIX.length);
      const codes = {};
      for (const [counterKey, count] of Object.entries(counters)) {
        const match = counterKey.startsWith(`${ENDPOINT_CODE_PREFIX}${name}.codes.`);
        if (match) {
          codes[counterKey.slice(counterKey.lastIndexOf(".") + 1)] = count;
        }
      }
      const errors = Object.entries(codes)
        .filter(([code]) => Number(code) >= 400)
        .reduce((total, [, count]) => total + count, 0);
      return { name, stats, codes, errors };
    })
    .sort((a, b) => b.stats.p95 - a.stats.p95);
}

/** Counters the scenarios emit themselves (processor.js), minus Artillery's own. */
function scenarioCounters(counters) {
  const ignore = /^(http\.|vusers\.|plugins\.|errors\.)/;
  return Object.entries(counters)
    .filter(([key]) => !ignore.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
}

function scenarioSummaries(summaries) {
  const ignore = /^(http\.response_time|plugins\.|vusers\.session_length)/;
  return Object.entries(summaries)
    .filter(([key]) => !ignore.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
}

function statusCodeRows(counters) {
  return Object.entries(counters)
    .filter(([key]) => key.startsWith("http.codes."))
    .map(([key, count]) => ({ code: key.slice("http.codes.".length), count }))
    .sort((a, b) => Number(a.code) - Number(b.code));
}

function buildModel(data, opts, inputFile) {
  const aggregate = data.aggregate || {};
  const counters = aggregate.counters || {};
  const summaries = aggregate.summaries || {};
  const intervals = data.intermediate || [];

  const responseTime = summaries["http.response_time"] || null;
  const requests = counters["http.requests"] || 0;
  const responses = counters["http.responses"] || 0;
  const codes = statusCodeRows(counters);
  const failures = codes
    .filter((row) => Number(row.code) >= 400)
    .reduce((total, row) => total + row.count, 0);
  const transportErrors = Object.entries(counters)
    .filter(([key]) => key.startsWith("errors."))
    .map(([key, count]) => ({ name: key.slice("errors.".length), count }))
    .sort((a, b) => b.count - a.count);

  const start = aggregate.firstCounterAt || (intervals[0] && Number(intervals[0].period));
  const end = aggregate.lastCounterAt || start;
  const durationSec = Math.max(1, Math.round((end - start) / 1000));

  // Per-interval series, keyed off the reporting period so the x axis is wall
  // clock rather than sample index (Artillery skips empty periods).
  const points = intervals.map((interval) => {
    const stats = (interval.summaries && interval.summaries["http.response_time"]) || null;
    const intervalCodes = {};
    for (const [key, count] of Object.entries(interval.counters || {})) {
      if (key.startsWith("http.codes.")) {
        intervalCodes[key.slice("http.codes.".length)] = count;
      }
    }
    return {
      t: Math.max(0, Math.round((Number(interval.period) - start) / 1000)),
      p50: stats ? stats.p50 : null,
      p95: stats ? stats.p95 : null,
      p99: stats ? stats.p99 : null,
      rate: (interval.rates && interval.rates["http.request_rate"]) || 0,
      codes: intervalCodes,
    };
  });

  const errorCodes = [
    ...new Set(
      points.flatMap((point) => Object.keys(point.codes).filter((code) => Number(code) >= 400)),
    ),
  ].sort();

  return {
    file: path.basename(inputFile),
    generatedAt: new Date(),
    start: start ? new Date(start) : null,
    end: end ? new Date(end) : null,
    durationSec,
    requests,
    responses,
    requestRate: (aggregate.rates && aggregate.rates["http.request_rate"]) || 0,
    downloadedBytes: counters["http.downloaded_bytes"] || 0,
    responseTime,
    sessionLength: summaries["vusers.session_length"] || null,
    vusers: {
      created: counters["vusers.created"] || 0,
      completed: counters["vusers.completed"] || 0,
      failed: counters["vusers.failed"] || 0,
    },
    scenarios: Object.entries(counters)
      .filter(([key]) => key.startsWith("vusers.created_by_name."))
      .map(([key, count]) => ({ name: key.slice("vusers.created_by_name.".length), count }))
      .sort((a, b) => b.count - a.count),
    expectations: {
      ok: counters["plugins.expect.ok"] || 0,
      failed: sumByPrefix(counters, "plugins.expect.failed"),
    },
    codes,
    failures,
    transportErrors,
    endpoints: endpointRows(aggregate),
    scenarioCounters: scenarioCounters(counters),
    scenarioSummaries: scenarioSummaries(summaries),
    points,
    errorCodes,
    thresholds: { p95: opts.p95, p99: opts.p99 },
  };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

const num = (value) => (value === null || value === undefined ? "—" : value.toLocaleString("en-US"));

function ms(value) {
  if (value === null || value === undefined) return "—";
  if (value >= 10000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value).toLocaleString("en-US")} ms`;
}

function bytes(value) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function clock(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function duration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs ? `${mins}m ${secs}s` : `${mins}m`;
}

/* -------------------------------------------------------------------------- */
/* SVG charts                                                                  */
/* -------------------------------------------------------------------------- */

const CHART = { width: 960, height: 300, top: 16, right: 92, bottom: 34, left: 60 };

/** Axis ticks at a round interval, covering [0, max]. */
function niceTicks(max, target = 5) {
  if (!(max > 0)) return { ticks: [0, 1], max: 1 };
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { ticks, max: top };
}

/**
 * A multi-series line chart. `series` is `[{ key, label, color, values }]` with
 * `values` aligned to `xs` (elapsed seconds); nulls break the line.
 */
function lineChart(id, { xs, series, yFormat, yLabel }) {
  const { width, height, top, right, bottom, left } = CHART;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xMax = Math.max(1, xs[xs.length - 1] || 1);
  const dataMax = Math.max(
    ...series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined)),
    0,
  );
  const { ticks, max } = niceTicks(dataMax);
  const x = (value) => left + (value / xMax) * plotWidth;
  const y = (value) => top + plotHeight - (value / max) * plotHeight;

  const gridlines = ticks
    .map(
      (tick) =>
        `<line class="grid" x1="${left}" x2="${left + plotWidth}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}"/>` +
        `<text class="tick" x="${left - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${escapeHtml(yFormat(tick))}</text>`,
    )
    .join("");

  // About six time labels, whatever the run length.
  const xStep = Math.max(1, Math.ceil(xs.length / 6));
  const xTicks = xs
    .filter((_, index) => index % xStep === 0)
    .map(
      (value) =>
        `<text class="tick" x="${x(value).toFixed(1)}" y="${height - bottom + 22}" text-anchor="middle">${clock(value)}</text>`,
    )
    .join("");

  const paths = series
    .map((s) => {
      let path = "";
      let penDown = false;
      s.values.forEach((value, index) => {
        if (value === null || value === undefined) {
          penDown = false;
          return;
        }
        path += `${penDown ? "L" : "M"}${x(xs[index]).toFixed(1)} ${y(value).toFixed(1)} `;
        penDown = true;
      });
      return `<path class="line" d="${path.trim()}" stroke="${s.color}"/>`;
    })
    .join("");

  // Direct labels at the line ends, nudged apart so they cannot overlap.
  const ends = series
    .map((s) => {
      const lastIndex = s.values.reduce(
        (found, value, index) => (value === null || value === undefined ? found : index),
        -1,
      );
      return lastIndex < 0 ? null : { label: s.label, color: s.color, y: y(s.values[lastIndex]) };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  let previous = -Infinity;
  const endLabels = ends
    .map((end) => {
      const labelY = Math.max(end.y, previous + 15);
      previous = labelY;
      return `<text class="end-label" x="${left + plotWidth + 10}" y="${(labelY + 4).toFixed(1)}" fill="${end.color}">${escapeHtml(end.label)}</text>`;
    })
    .join("");

  const hoverDots = series
    .map((s) => `<circle class="hover-dot" data-key="${escapeHtml(s.key)}" r="5" fill="${s.color}"/>`)
    .join("");

  const legend = series.length < 2
    ? ""
    : series
    .map(
      (s) =>
        `<span class="legend-item"><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`,
    )
    .join("");

  const chartData = {
    xs,
    left,
    right,
    width,
    height,
    plotWidth,
    top,
    plotHeight,
    yMax: max,
    series: series.map((s) => ({ key: s.key, label: s.label, color: s.color, values: s.values })),
  };

  return `
<div class="chart" id="${id}">
  ${legend ? `<div class="legend">${legend}</div>` : ""}
  <div class="plot">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(yLabel)} over time" tabindex="0">
      ${gridlines}
      <line class="axis" x1="${left}" x2="${left + plotWidth}" y1="${top + plotHeight}" y2="${top + plotHeight}"/>
      ${xTicks}
      <line class="crosshair" y1="${top}" y2="${top + plotHeight}" x1="0" x2="0" style="display:none"/>
      ${paths}
      ${endLabels}
      <g class="hover-dots" style="display:none">${hoverDots}</g>
      <rect class="hit" x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="transparent"/>
    </svg>
    <div class="tooltip" hidden></div>
  </div>
  <script type="application/json" class="chart-data">${JSON.stringify(chartData)}</script>
</div>`;
}

/** Horizontal bars for per-endpoint p95, with a tick marking p99. */
function endpointChart(rows) {
  if (!rows.length) return "";
  const rowHeight = 30;
  const left = 260;
  const right = 70;
  const width = 960;
  const height = rows.length * rowHeight + 34;
  const plotWidth = width - left - right;
  const dataMax = Math.max(...rows.map((row) => row.stats.p99));
  const { ticks, max } = niceTicks(dataMax, 4);
  const scale = (value) => (value / max) * plotWidth;

  const gridlines = ticks
    .map(
      (tick) =>
        `<line class="grid" x1="${(left + scale(tick)).toFixed(1)}" x2="${(left + scale(tick)).toFixed(1)}" y1="0" y2="${rows.length * rowHeight}"/>` +
        `<text class="tick" x="${(left + scale(tick)).toFixed(1)}" y="${rows.length * rowHeight + 20}" text-anchor="middle">${ms(tick)}</text>`,
    )
    .join("");

  const bars = rows
    .map((row, index) => {
      const y = index * rowHeight + 5;
      const barHeight = 14;
      // 2px surface gap at the baseline, 4px rounded data end.
      const barWidth = Math.max(4, scale(row.stats.p95));
      const radius = Math.min(4, barWidth);
      const p99x = left + scale(row.stats.p99);
      const label = row.name.length > 36 ? `${row.name.slice(0, 35)}…` : row.name;
      return `
      <g class="bar-row" data-label="${escapeHtml(row.name)}" data-detail="${escapeHtml(
        `p50 ${ms(row.stats.p50)} · p95 ${ms(row.stats.p95)} · p99 ${ms(row.stats.p99)} · max ${ms(row.stats.max)} · ${num(row.stats.count)} requests`,
      )}">
        <rect class="bar-hit" x="0" y="${index * rowHeight}" width="${width}" height="${rowHeight}" fill="transparent"/>
        <text class="bar-label" x="${left - 12}" y="${y + barHeight - 2}" text-anchor="end">${escapeHtml(label)}</text>
        <path class="bar" d="M${left} ${y} H${left + barWidth - radius} a${radius} ${radius} 0 0 1 ${radius} ${radius} V${y + barHeight - radius} a${radius} ${radius} 0 0 1 -${radius} ${radius} H${left} Z"/>
        <line class="p99-tick" x1="${p99x.toFixed(1)}" x2="${p99x.toFixed(1)}" y1="${y - 3}" y2="${y + barHeight + 3}"/>
        <text class="bar-value" x="${left + plotWidth + 10}" y="${y + barHeight - 2}">${ms(row.stats.p95)}</text>
      </g>`;
    })
    .join("");

  return `
<div class="chart" id="endpoint-chart">
  <div class="legend">
    <span class="legend-item"><span class="swatch swatch-bar"></span>p95</span>
    <span class="legend-item"><span class="swatch swatch-tick"></span>p99</span>
  </div>
  <div class="plot">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Response time by endpoint">
      ${gridlines}
      <line class="axis" x1="${left}" x2="${left}" y1="0" y2="${rows.length * rowHeight}"/>
      ${bars}
    </svg>
    <div class="tooltip" hidden></div>
  </div>
</div>`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function statTile({ label, value, note, state }) {
  const chip = state
    ? `<span class="chip chip-${state.kind}">${escapeHtml(state.label)}</span>`
    : "";
  return `
  <div class="tile">
    <div class="tile-label">${escapeHtml(label)}</div>
    <div class="tile-value">${value}</div>
    <div class="tile-note">${note ? escapeHtml(note) : ""} ${chip}</div>
  </div>`;
}

function table(headers, rows, { align = [] } = {}) {
  if (!rows.length) return "";
  const head = headers
    .map((header, index) => `<th${align[index] === "right" ? ' class="right"' : ""}>${escapeHtml(header)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => `<td${align[index] === "right" ? ' class="right"' : ""}>${cell}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function dataTable(summary, html) {
  if (!html) return "";
  return `<details class="data-table"><summary>${escapeHtml(summary)}</summary>${html}</details>`;
}

function section(title, blurb, body) {
  return `
<section>
  <h2>${escapeHtml(title)}</h2>
  ${blurb ? `<p class="blurb">${escapeHtml(blurb)}</p>` : ""}
  ${body}
</section>`;
}

function percentileSection(model) {
  if (!model.points.length) return "";
  const xs = model.points.map((point) => point.t);
  const chart = lineChart("latency-chart", {
    xs,
    yLabel: "Response time",
    yFormat: ms,
    series: [
      { key: "p50", label: "p50", color: "var(--pct-low)", values: model.points.map((p) => p.p50) },
      { key: "p95", label: "p95", color: "var(--pct-mid)", values: model.points.map((p) => p.p95) },
      { key: "p99", label: "p99", color: "var(--pct-high)", values: model.points.map((p) => p.p99) },
    ],
  });
  const rows = model.points.map((point) => [clock(point.t), ms(point.p50), ms(point.p95), ms(point.p99)]);
  return section(
    "Response time over time",
    "Percentiles per 10-second reporting period, across every request in the run.",
    chart + dataTable("Show data table", table(["Elapsed", "p50", "p95", "p99"], rows, { align: ["left", "right", "right", "right"] })),
  );
}

function rateSection(model) {
  if (!model.points.length) return "";
  const xs = model.points.map((point) => point.t);
  const chart = lineChart("rate-chart", {
    xs,
    yLabel: "Request rate",
    yFormat: (value) => `${value}/s`,
    series: [
      {
        key: "rate",
        label: "req/s",
        color: "var(--ordinal-2)",
        values: model.points.map((point) => point.rate),
      },
    ],
  });
  const rows = model.points.map((point) => [clock(point.t), `${num(point.rate)}/s`]);
  return section(
    "Request rate",
    "Requests per second the run actually generated, which is the load the server saw.",
    chart + dataTable("Show data table", table(["Elapsed", "Rate"], rows, { align: ["left", "right"] })),
  );
}

const ERROR_SERIES_COLORS = ["var(--series-8)", "var(--series-2)", "var(--series-7)", "var(--series-5)"];

function errorSection(model) {
  if (!model.errorCodes.length) return "";
  const xs = model.points.map((point) => point.t);
  const chart = lineChart("error-chart", {
    xs,
    yLabel: "Error responses",
    yFormat: (value) => num(value),
    series: model.errorCodes.slice(0, 4).map((code, index) => ({
      key: code,
      label: code,
      color: ERROR_SERIES_COLORS[index],
      values: model.points.map((point) => point.codes[code] || 0),
    })),
  });
  const shown = model.errorCodes.slice(0, 4);
  const rows = model.points.map((point) => [
    clock(point.t),
    ...shown.map((code) => num(point.codes[code] || 0)),
  ]);
  return section(
    "4xx / 5xx responses over time",
    "When failures started matters more than the total: a flat line is a rejected request type, a rising one is the server giving way.",
    chart +
      dataTable(
        "Show data table",
        table(["Elapsed", ...shown], rows, { align: ["left", ...shown.map(() => "right")] }),
      ),
  );
}

function endpointSection(model) {
  if (!model.endpoints.length) return "";
  const rows = model.endpoints.map((row) => [
    escapeHtml(row.name),
    num(row.stats.count),
    ms(row.stats.mean),
    ms(row.stats.p50),
    ms(row.stats.p95),
    ms(row.stats.p99),
    ms(row.stats.max),
    row.errors
      ? `<span class="chip chip-critical">${num(row.errors)}</span>`
      : `<span class="muted">0</span>`,
  ]);
  return section(
    "Response time by endpoint",
    "Sorted by p95. A healthy aggregate can still hide one endpoint that is slow for everybody.",
    endpointChart(model.endpoints) +
      dataTable(
        "Show data table",
        table(["Endpoint", "Requests", "Mean", "p50", "p95", "p99", "Max", "4xx/5xx"], rows, {
          align: ["left", "right", "right", "right", "right", "right", "right", "right"],
        }),
      ),
  );
}

function summarySection(model) {
  const rt = model.responseTime;
  const p95State = rt
    ? rt.p95 <= model.thresholds.p95
      ? { kind: "good", label: `✓ under ${ms(model.thresholds.p95)}` }
      : { kind: "critical", label: `! over ${ms(model.thresholds.p95)}` }
    : null;
  const p99State = rt
    ? rt.p99 <= model.thresholds.p99
      ? { kind: "good", label: `✓ under ${ms(model.thresholds.p99)}` }
      : { kind: "critical", label: `! over ${ms(model.thresholds.p99)}` }
    : null;
  const errorRate = model.responses ? (model.failures / model.responses) * 100 : 0;
  const vuserState = model.vusers.failed
    ? { kind: "critical", label: `! ${num(model.vusers.failed)} failed` }
    : { kind: "good", label: "✓ none failed" };

  const tiles = [
    statTile({ label: "Requests", value: num(model.requests), note: `${num(model.requestRate)}/s mean` }),
    statTile({
      label: "p95 response time",
      value: rt ? ms(rt.p95) : "—",
      note: rt ? `median ${ms(rt.p50)}` : "",
      state: p95State,
    }),
    statTile({
      label: "p99 response time",
      value: rt ? ms(rt.p99) : "—",
      note: rt ? `max ${ms(rt.max)}` : "",
      state: p99State,
    }),
    statTile({
      label: "4xx / 5xx responses",
      value: num(model.failures),
      note: `${errorRate.toFixed(2)}% of responses`,
      state: model.failures
        ? { kind: "warning", label: "check the codes below" }
        : { kind: "good", label: "✓ none" },
    }),
    statTile({
      label: "Virtual users",
      value: num(model.vusers.completed),
      note: `${num(model.vusers.created)} created`,
      state: vuserState,
    }),
    statTile({
      label: "Session length p95",
      value: model.sessionLength ? ms(model.sessionLength.p95) : "—",
      note: model.sessionLength ? `median ${ms(model.sessionLength.p50)}` : "",
    }),
  ].join("");

  return `<div class="tiles">${tiles}</div>`;
}

function breakdownSection(model) {
  const codes = table(
    ["Status", "Count", "Share"],
    model.codes.map((row) => [
      Number(row.code) >= 400
        ? `<span class="chip chip-critical">${escapeHtml(row.code)}</span>`
        : escapeHtml(row.code),
      num(row.count),
      `${((row.count / Math.max(1, model.responses)) * 100).toFixed(1)}%`,
    ]),
    { align: ["left", "right", "right"] },
  );
  const scenarios = table(
    ["Scenario", "Virtual users"],
    model.scenarios.map((row) => [escapeHtml(row.name), num(row.count)]),
    { align: ["left", "right"] },
  );
  const transport = model.transportErrors.length
    ? table(
        ["Error", "Count"],
        model.transportErrors.map((row) => [
          `<span class="chip chip-critical">${escapeHtml(row.name)}</span>`,
          num(row.count),
        ]),
        { align: ["left", "right"] },
      )
    : "";

  const columns = [
    codes ? `<div><h3>Status codes</h3>${codes}</div>` : "",
    scenarios ? `<div><h3>Scenarios</h3>${scenarios}</div>` : "",
    transport ? `<div><h3>Transport errors</h3>${transport}</div>` : "",
  ].join("");
  if (!columns) return "";
  return section("Run breakdown", "", `<div class="columns">${columns}</div>`);
}

function customSection(model) {
  if (!model.scenarioCounters.length && !model.scenarioSummaries.length) return "";
  const counters = table(
    ["Counter", "Total"],
    model.scenarioCounters.map(([key, value]) => [escapeHtml(key), num(value)]),
    { align: ["left", "right"] },
  );
  const summaries = table(
    ["Metric", "Min", "Mean", "p95", "p99", "Max", "Count"],
    model.scenarioSummaries.map(([key, stats]) => [
      escapeHtml(key),
      num(stats.min),
      num(Math.round(stats.mean)),
      num(stats.p95),
      num(stats.p99),
      num(stats.max),
      num(stats.count),
    ]),
    { align: ["left", "right", "right", "right", "right", "right", "right"] },
  );
  return section(
    "Scenario metrics",
    "Emitted by processor.js: payload sizes, slow-response counts and malformed-body counts the HTTP status cannot show.",
    `<div class="columns">
      ${counters ? `<div><h3>Counters</h3>${counters}</div>` : ""}
      ${summaries ? `<div><h3>Distributions</h3>${summaries}</div>` : ""}
    </div>`,
  );
}

function renderHtml(model) {
  const expectNote = model.expectations.ok || model.expectations.failed
    ? `${num(model.expectations.ok)} expectations passed, ${num(model.expectations.failed)} failed`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Load test — ${escapeHtml(model.file)}</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7;
  --surface: #fcfcfb;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.10);
  --ordinal-1: #86b6ef;
  --ordinal-2: #2a78d6;
  --ordinal-3: #104281;
  --pct-low: #86b6ef;
  --pct-mid: #2a78d6;
  --pct-high: #104281;
  --bar-fill: #2a78d6;
  --bar-tick: #104281;
  --series-2: #eb6834;
  --series-5: #e87ba4;
  --series-7: #6250d6;
  --series-8: #e34948;
  --good: #0ca30c;
  --warning: #fab219;
  --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface: #1a1a19;
    --text-primary: #f0efec;
    --text-secondary: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255, 255, 255, 0.10);
    --ordinal-1: #b7d3f6;
    --ordinal-2: #5598e7;
    --ordinal-3: #184f95;
    --pct-low: #184f95;
    --pct-mid: #5598e7;
    --pct-high: #b7d3f6;
    --bar-fill: #5598e7;
    --bar-tick: #b7d3f6;
    --series-2: #d95926;
    --series-5: #d55181;
    --series-7: #9085e9;
    --series-8: #e66767;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d;
  --surface: #1a1a19;
  --text-primary: #f0efec;
  --text-secondary: #c3c2b7;
  --muted: #898781;
  --grid: #2c2c2a;
  --axis: #383835;
  --border: rgba(255, 255, 255, 0.10);
  --ordinal-1: #b7d3f6;
  --ordinal-2: #5598e7;
  --ordinal-3: #184f95;
  --pct-low: #184f95;
  --pct-mid: #5598e7;
  --pct-high: #b7d3f6;
  --bar-fill: #5598e7;
  --bar-tick: #b7d3f6;
  --series-2: #d95926;
  --series-5: #d55181;
  --series-7: #9085e9;
  --series-8: #e66767;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--page);
  color: var(--text-primary);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1100px; margin: 0 auto; padding: 32px 16px 64px; }
header { display: flex; flex-wrap: wrap; gap: 16px; align-items: baseline; justify-content: space-between; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 0 0 4px; }
h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin: 0 0 8px; }
.meta { color: var(--text-secondary); font-size: 13px; }
.blurb { color: var(--text-secondary); font-size: 13px; margin: 0 0 16px; max-width: 70ch; }
section { margin-top: 36px; }
.theme-toggle {
  border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary);
  border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer;
}
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 24px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.tile-label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.tile-value { font-size: 28px; margin: 6px 0 4px; }
.tile-note { font-size: 12px; color: var(--muted); min-height: 20px; }
.chip { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; white-space: nowrap; }
.chip-good { background: color-mix(in srgb, var(--good) 16%, transparent); color: var(--good); }
.chip-warning { background: color-mix(in srgb, var(--warning) 20%, transparent); color: var(--text-primary); }
.chip-critical { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.chart { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.plot { position: relative; }
.chart svg { width: 100%; height: auto; display: block; overflow: visible; }
.chart svg:focus-visible { outline: 2px solid var(--ordinal-2); outline-offset: 4px; }
.grid { stroke: var(--grid); stroke-width: 1; }
.axis { stroke: var(--axis); stroke-width: 1; }
.tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.end-label { font-size: 12px; font-weight: 600; }
.crosshair { stroke: var(--axis); stroke-width: 1; }
.hover-dot { stroke: var(--surface); stroke-width: 2; }
.bar { fill: var(--bar-fill); }
.p99-tick { stroke: var(--bar-tick); stroke-width: 2; }
.bar-label { fill: var(--text-secondary); font-size: 12px; }
.bar-value { fill: var(--text-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
.bar-row:hover .bar-hit, .bar-row:focus .bar-hit { fill: color-mix(in srgb, var(--text-primary) 5%, transparent); }
.legend { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; font-size: 12px; color: var(--text-secondary); }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.swatch-bar { background: var(--bar-fill); }
.swatch-tick { background: var(--bar-tick); width: 3px; height: 14px; border-radius: 1px; }
.tooltip {
  position: absolute; pointer-events: none; background: var(--surface); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14); white-space: nowrap; z-index: 2;
}
.tooltip-title { color: var(--text-secondary); margin-bottom: 4px; }
.tooltip-row { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border); }
th { color: var(--text-secondary); font-weight: 600; font-size: 12px; }
td { font-variant-numeric: tabular-nums; }
.right { text-align: right; }
.muted { color: var(--muted); }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; align-items: start; }
.data-table { margin-top: 12px; }
.data-table summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); padding: 6px 0; }
.data-table table { margin-top: 8px; }
footer { margin-top: 48px; color: var(--muted); font-size: 12px; }
@media (max-width: 640px) {
  .wrap { padding: 20px 16px 48px; }
  .tile-value { font-size: 24px; }
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Load test — ${escapeHtml(model.file)}</h1>
      <div class="meta">
        ${model.start ? escapeHtml(model.start.toLocaleString()) : "unknown start"} ·
        ${escapeHtml(duration(model.durationSec))} ·
        ${num(model.requests)} requests · ${escapeHtml(bytes(model.downloadedBytes))} downloaded
        ${expectNote ? ` · ${escapeHtml(expectNote)}` : ""}
      </div>
    </div>
    <button class="theme-toggle" type="button" id="theme-toggle">Toggle theme</button>
  </header>

  ${summarySection(model)}
  ${percentileSection(model)}
  ${rateSection(model)}
  ${endpointSection(model)}
  ${errorSection(model)}
  ${breakdownSection(model)}
  ${customSection(model)}

  <footer>
    Generated by <code>loadtest/report.js</code> from ${escapeHtml(model.file)} on
    ${escapeHtml(model.generatedAt.toLocaleString())}.
    Pass/fail chips compare against p95 ${escapeHtml(ms(model.thresholds.p95))} and p99 ${escapeHtml(ms(model.thresholds.p99))}.
  </footer>
</div>
<script>
(function () {
  "use strict";

  var toggle = document.getElementById("theme-toggle");
  function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  var saved = stored("loadtest-report-theme");
  if (saved) { document.documentElement.setAttribute("data-theme", saved); }
  toggle.addEventListener("click", function () {
    var dark = getComputedStyle(document.documentElement).colorScheme === "dark";
    var next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("loadtest-report-theme", next); } catch (e) {}
  });

  function formatValue(chartId, value) {
    if (value === null || value === undefined) { return "—"; }
    if (chartId === "rate-chart") { return value.toLocaleString("en-US") + "/s"; }
    if (chartId === "error-chart") { return value.toLocaleString("en-US"); }
    return value >= 10000 ? (value / 1000).toFixed(1) + " s" : Math.round(value).toLocaleString("en-US") + " ms";
  }

  function clock(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return mins + ":" + String(secs).padStart(2, "0");
  }

  // Crosshair + tooltip for every line chart on the page. Keyboard users get the
  // same readout by focusing the plot and using the arrow keys.
  document.querySelectorAll(".chart .chart-data").forEach(function (node) {
    var chart = node.closest(".chart");
    var data = JSON.parse(node.textContent);
    var svg = chart.querySelector("svg");
    var tooltip = chart.querySelector(".tooltip");
    var crosshair = chart.querySelector(".crosshair");
    var dots = chart.querySelector(".hover-dots");
    var dotNodes = {};
    dots.querySelectorAll(".hover-dot").forEach(function (dot) { dotNodes[dot.dataset.key] = dot; });
    var current = -1;

    function show(index) {
      if (index < 0 || index >= data.xs.length) { return; }
      current = index;
      var xMax = data.xs[data.xs.length - 1] || 1;
      var x = data.left + (data.xs[index] / xMax) * data.plotWidth;
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.style.display = "";
      dots.style.display = "";

      var rows = "";
      data.series.forEach(function (series) {
        var value = series.values[index];
        var dot = dotNodes[series.key];
        if (value === null || value === undefined) {
          dot.style.display = "none";
        } else {
          dot.style.display = "";
          dot.setAttribute("cx", x);
          dot.setAttribute("cy", series.y[index]);
        }
        rows +=
          '<div class="tooltip-row"><span class="swatch" style="background:' + series.color + '"></span>' +
          series.label + " " + formatValue(chart.id, value) + "</div>";
      });
      tooltip.innerHTML = '<div class="tooltip-title">' + clock(data.xs[index]) + " elapsed</div>" + rows;
      tooltip.hidden = false;
      var box = svg.getBoundingClientRect();
      var px = (x / data.width) * box.width;
      tooltip.style.left = Math.min(Math.max(px + 14, 0), box.width - tooltip.offsetWidth - 4) + "px";
      tooltip.style.top = Math.max(8, (data.top / data.height) * box.height) + "px";
    }

    function hide() {
      tooltip.hidden = true;
      crosshair.style.display = "none";
      dots.style.display = "none";
    }

    // Pre-compute pixel y for each point so hovering stays cheap.
    data.series.forEach(function (series) {
      series.y = series.values.map(function (value) {
        if (value === null || value === undefined) { return 0; }
        return data.top + data.plotHeight - (value / data.yMax) * data.plotHeight;
      });
    });

    function indexFromClientX(clientX) {
      var box = svg.getBoundingClientRect();
      var svgX = ((clientX - box.left) / box.width) * data.width;
      var xMax = data.xs[data.xs.length - 1] || 1;
      var value = ((svgX - data.left) / data.plotWidth) * xMax;
      var best = 0;
      var bestDistance = Infinity;
      data.xs.forEach(function (x, index) {
        var distance = Math.abs(x - value);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      return best;
    }

    svg.addEventListener("mousemove", function (event) { show(indexFromClientX(event.clientX)); });
    svg.addEventListener("mouseleave", hide);
    svg.addEventListener("focus", function () { show(current < 0 ? 0 : current); });
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight") { show(Math.min(current + 1, data.xs.length - 1)); event.preventDefault(); }
      if (event.key === "ArrowLeft") { show(Math.max(current - 1, 0)); event.preventDefault(); }
      if (event.key === "Escape") { hide(); }
    });
  });

  // Per-bar tooltip on the endpoint chart.
  var endpointChart = document.getElementById("endpoint-chart");
  if (endpointChart) {
    var endpointTooltip = endpointChart.querySelector(".tooltip");
    endpointChart.querySelectorAll(".bar-row").forEach(function (row) {
      row.addEventListener("mousemove", function (event) {
        var box = endpointChart.querySelector(".plot").getBoundingClientRect();
        endpointTooltip.innerHTML =
          '<div class="tooltip-title">' + row.dataset.label + "</div>" +
          '<div class="tooltip-row">' + row.dataset.detail + "</div>";
        endpointTooltip.hidden = false;
        endpointTooltip.style.left =
          Math.min(event.clientX - box.left + 14, box.width - endpointTooltip.offsetWidth - 4) + "px";
        endpointTooltip.style.top = event.clientY - box.top + 14 + "px";
      });
      row.addEventListener("mouseleave", function () { endpointTooltip.hidden = true; });
    });
  }
})();
</script>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (opts.help) {
    console.log("Usage: node report.js [results.json] [-o report.html] [--p95 ms] [--p99 ms]");
    return;
  }

  if (!fs.existsSync(opts.input)) {
    console.error(`No such results file: ${opts.input}`);
    console.error("Produce one with: artillery run -o results.json artillery.yml");
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(opts.input, "utf8"));
  } catch (error) {
    console.error(`${opts.input} is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  if (!data.aggregate) {
    console.error(`${opts.input} has no "aggregate" section; is it an Artillery result file?`);
    process.exit(1);
  }

  const model = buildModel(data, opts, opts.input);
  fs.writeFileSync(opts.output, renderHtml(model));
  console.log(`Wrote ${opts.output} (${bytes(fs.statSync(opts.output).size)})`);
}

if (require.main === module) {
  main();
}

module.exports = { buildModel, renderHtml };
