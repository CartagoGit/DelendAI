# Project observability economics — methodology

This document defines the formulas, data-quality semantics and confidence
rules behind the mcp-vertex KPI capability (`@mcp-vertex/project-kpis`). It
is the canonical reference for how `summary`, `history`, `trends`, `audit`
and `efficiency` views are computed, so that every surface (MCP, CLI, VS
Code dashboard, CI) speaks the same language.

The mcp-vertex repository is the first dogfood target: `bun run --cwd
plugins/project-kpis test` and the `project_kpis` tool exercise this
methodology against the repository's own telemetry.

## Non-goals

- We never invent provider prices, token savings or coverage when the
  source is unavailable. Every value carries an explicit status.
- We never store prompts, response bodies, source code, credentials or
  secrets in telemetry.
- We do not reimplement security, dependency, quality, proposal or git
  scanners owned by other plugins; the KPI snapshot consumes their public
  adapters.

## Value semantics

Every metric uses one of these statuses:

| status           | meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| `measured`       | observed directly from telemetry or a public adapter.         |
| `estimated`      | derived from a configured price or a bounded projection.      |
| `unavailable`    | the source exists but did not provide a value in this window. |
| `not-configured` | the source is not enabled for this project/host.              |

Economics values additionally distinguish the basis of a cost/saving:

| basis                 | meaning                                                 |
| --------------------- | ------------------------------------------------------- |
| `provider-reported`   | the provider or rollup reported the value directly.     |
| `configured-estimate` | derived from a configured price table or baseline.      |
| `subscription`        | covered by a host subscription (not separately billed). |
| `unavailable`         | no evidence exists.                                     |

## Formulas

### Coverage

Coverage is the share of expected evidence dimensions that are present in
the window. With $D$ the set of required dimensions (plugin, tool, model,
agent, extension, request type, outcome) and $D_{\text{present}}$ the ones
with at least one observed invocation:

$$\text{coverage} = \frac{|D_{\text{present}}|}{|D|}$$

Coverage is `measured` when all dimensions are present, `partial` when some
are missing (e.g. model attribution absent), and `not-configured` when no
invocation telemetry exists at all.

### Delivery

Delivery is the share of committed slice work that reaches the expected
end state (done + peer-reviewed) in the window:

$$\text{delivery} = \frac{\text{slices done}}{\text{slices claimed + done}}$$

The source is the proposals plugin adapter. When proposals are not enabled,
delivery is `not-configured` and never defaults to zero.

### Reliability

Reliability is the success rate over the window. With $C$ total calls and
$C_{\text{ok}}$ successful calls:

$$\text{success rate} = \frac{C_{\text{ok}}}{C}$$

$$\text{error rate} = \frac{C_{\text{err}}}{C} = 1 - \text{success rate}$$

Reliability is `measured` from invocation outcomes. Error outcomes without a
structured classification are flagged by the audit view as unexplained
failures instead of silently inflating the error rate.

### Latency

Average latency is the mean of observed per-call durations; the p95 is the
95th percentile of the same sample:

$$\text{avg latency} = \frac{\sum \text{duration}_i}{n}, \qquad
\text{p95} = \text{percentile}_{95}(\text{durations})$$

Latency is `unavailable` when fewer than one numeric duration sample exists;
it is never invented.

### Token efficiency

Token efficiency relates work output to token spend:

$$\text{tokens per call} = \frac{\text{total tokens}}{C}$$

$$\text{utility per 1k tokens} = \frac{\text{useful output units}}{\text{tokens} / 1000}$$

`utilityPer1kTokens` comes from the usage-tracking rollup (`pluginKpis`),
which is computed from static schema bytes, compact typical payloads and
observed response samples.

### Estimated savings

Token savings are only reported when a source actually reported them
(`tokensSaved` in the usage-tracking rollup):

$$\text{token savings} = \sum \text{tokensSaved}_i \qquad \text{(measured)}$$

Financial savings compare a configured manual-effort baseline against
observed spend:

$$\text{manual hours} = \text{manualHoursPerTask} \times \text{taskCount}$$

$$\text{manual baseline USD} = \text{manual hours} \times \text{developerHourlyCostUsd}$$

$$\text{financial savings USD} = \max(0, \text{manual baseline USD} - \text{observed cost USD})$$

Because the counterfactual manual execution is never run, financial savings
are labelled `inferred`, never `measured`.

### Confidence / causality

Every saving carries a causality label:

| label      | rule                                                    |
| ---------- | ------------------------------------------------------- |
| `measured` | direct local observation (e.g. rollup `tokensSaved`).   |
| `inferred` | derived from a configured baseline (financial savings). |
| `unknown`  | no baseline and no source evidence.                     |

An aggregate view reports the strongest available label: `measured` if any
item is measured, else `inferred` if any is inferred, else `unknown`.

## Audit findings

The audit view classifies evidence gaps as findings with severity
`info | warning | error` and never fabricates them:

- **schema-incongruence** (error): telemetry rows flagged as incongruent or
  classified `schema-incongruence`.
- **unexplained-failures** (warning): error outcomes without a structured
  classification.
- **missing-telemetry-dimensions** (warning/info): model or request-type
  attribution entirely absent.
- **stale-snapshot** (warning): snapshot older than the requested window.
- **plugin-error-anomaly** (warning): a plugin with enough samples whose
  error rate exceeds the configured threshold (default 20%).
- **history-thin** (info): fewer than two persisted samples, so trends are
  not yet computable.

## Dogfooding commands

- MCP: `project_kpis view=summary|history|usage|economics|models|agents|plugins|errors|efficiency|audit`
- CLI: `mcp-vertex kpis <view> [--json] [--watch] [--threshold=...]`
- VS Code: the Project KPIs view (`mcp-vertex.kpis`).
- Audit + efficiency reports are generated by
  `audit-report.service.ts` and `efficiency-analysis.service.ts` and are
  covered by `plugins/project-kpis/tests/src/audit-report.spec.ts`.
