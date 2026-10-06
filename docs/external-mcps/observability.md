# Observability — Sentry, Datadog, Grafana, OTel, Logs

> Most observability MCPs are thin wrappers over vendor APIs. Pick the ones
> you pay for; skip the rest. They all expose `query_*` / `get_*` tools with
> the same shape.

## Recommended ⭐ seeds

### Sentry

| Server | Notes |
|---|---|
| `tgeselle/bugsnag-mcp` | If you use Bugsnag. |
| (Sentry's archived MCP from `servers-archived/src/sentry`) | **Unmaintained.** Find the current official if you need it. |

There is no current official Sentry MCP. The community fork at
`sentry/sentry-mcp` (if/when it ships) would be the canonical one — re-verify
on unpause.

### Datadog / New Relic / Honeycomb

| Server | Notes |
|---|---|
| `mcp-datadog` (community) | ~5 free tools. |
| `mcp-newrelic` (community) | APM queries. |
| `mcp-honeybadger` (community) | Error tracking. |

### Grafana / Prometheus / OTel

| Server | Maintainer | Notes |
|---|---|---|
| `grafana/mcp` (official Grafana) | Grafana | **Wire if you use Grafana Cloud.** 500k+ weekly visitors (Docker Hub). |
| `mcp-prometheus` (pab1it0) | Community | PromQL queries. |
| `opentelemetry/opentelemetry-mcp` | Community | OTel collector. |
| `mcp-loki` | Community | Loki log queries. |
| `mcp-tempo` | Community | Tempo tracing. |
| `mcp-jaeger` (mshegolev) | Community | Jaeger. |
| `BetterDB/monitor` | Community | Valkey/Redis observability. |
| `spre-sre/lumino-mcp-server` | Community | AI-powered SRE observability for k8s/OpenShift. |
| `skyhook-io/radar` | Community | Built-in MCP for Radar (Kubernetes visibility tool). |

### Status / incident management

| Server | Vendor |
|---|---|
| `Rootly-AI-Labs/Rootly-MCP-server` (official) | Rootly. |
| `PagerDuty/mcp-server` (if exists) | PagerDuty. |
| `mcp-opsgenie` (community) | Opsgenie. |
| `mcp-statuspage` (community) | Statuspage.io. |
| `mcp-uptime` (community) | Uptime monitoring. |
| `mcp-pingdom` (community) | Pingdom. |

## Log aggregation

Most log vendors ship their own MCP now:

| Server | Vendor |
|---|---|
| `VictoriaMetrics-Community/mcp-victorialogs` (official) | VictoriaLogs. |
| `influxdata/influxdb3_mcp_server` (official) | InfluxDB 3. |
| (vendor-specific) | Datadog, Splunk, Elastic — re-verify on unpause. |

## Synthetic monitoring / RUM

These vendors mostly don't have MCP servers yet. Use `chrome-devtools-mcp` to
automate browser-side checks instead.

## What f00068 needs to update

The 🟡 discoverable tier's observability section is mostly fine. The
official Grafana MCP (`grafana/mcp`) is high-quality and worth promoting to
the curated tier if the workspace uses Grafana Cloud.

Skip Bugsnag, Better Stack, Rollbar, Bugsnag, Honeybadger, PagerDuty,
Opsgenie, Statuspage, Uptime, Pingdom — they all have community MCPs but
none is canonical or maintained.