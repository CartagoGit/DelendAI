# Project observability — KPIs, economics and dogfooding

The `@delendai/project-kpis` plugin turns delendai's own telemetry into
a single, auditable, historical KPI surface shared by the MCP/LLM tools, the
CLI, CI/JSON output and the VS Code dashboard. This guide covers privacy,
retention, unavailable-metric semantics, cost methodology, baselines and how
to dogfood the feature on the delendai repository itself.

The formulas behind every metric live in
[`docs/delendai/specs/project-observability-economics.md`](./specs/project-observability-economics.md).

## What is measured

- **Health**: project-health adapter (score, security, deps, quality, debt).
- **Delivery**: proposals adapter (claimed vs done slices).
- **Usage**: usage-tracking adapter (calls, errors, tokens, cost, savings).
- **Economics**: provider-reported cost, configured estimates, subscription
  and unavailable values — never invented.
- **History & trends**: durable snapshots with up/down/stable/unknown trends.
- **Audit & efficiency**: evidence-backed incongruence findings and
  baseline-vs-observed efficiency with explicit causality.

## Privacy

- Telemetry records **metadata only**: timestamp, session, host, agent,
  extension, model, plugin, tool, request type, iteration, duration,
  outcome, error classification and token/cost figures.
- **Prompts, response bodies, source content, credentials and secrets are
  never recorded, persisted or returned.** Every KPI view carries a
  `privacy` section stating this and listing the current limitations.
- Error telemetry is redacted and carries a correlation id, never the
  underlying message content of a credential.

## Retention

- KPI snapshots are persisted atomically under the configured cache path
  (`.cache/delendai/results/project-kpis/history.json`) with a retention
  window and mutex protection, so concurrent writers never corrupt the
  store.
- The history window is configurable (`--window-days`, `windowDays`). Older
  entries outside retention are pruned on persist.

## Unavailable metrics

Every metric carries one of `measured`, `estimated`, `unavailable`,
`not-configured`. Economics values additionally distinguish
`provider-reported`, `configured-estimate`, `subscription` and `unavailable`.

- A missing source is reported as `not-configured` (or `unavailable`), never
  as a misleading zero.
- Trend views stay explicit when fewer than two history samples exist.
- The audit view classifies evidence gaps (missing model attribution,
  unexplained failures, stale snapshots, plugin error anomalies) instead of
  papering over them.

## Cost methodology

- **Provider-reported** costs come straight from the usage-tracking rollup.
- **Configured estimates** are derived from an explicit price table or a
  configured manual-effort baseline.
- **Subscription** values mean the cost is covered by a host subscription
  and is not separately billed.
- Financial savings are only reported when a baseline and source data both
  exist, and they are always labelled `inferred` (the counterfactual manual
  execution is never run). Token savings are `measured` only when the
  rollup actually reported them.

## Baselines

Efficiency analysis compares configured baselines against observed
MCP-assisted usage:

```
manualHours     = manualHoursPerTask × taskCount
manualBaseline  = manualHours × developerHourlyCostUsd
financialSavings = max(0, manualBaseline − observedCostUsd)
```

Causality is labelled `measured` (direct observation), `inferred`
(baseline-derived) or `unknown` (no baseline or source evidence).

## Dogfooding commands

- **MCP**: `project_kpis view=summary|history|usage|economics|models|agents|plugins|errors|efficiency|audit`
- **CLI**:
  - `delendai kpis summary` — human summary
  - `delendai kpis costs --json` — stable JSON for CI/scripts
  - `delendai kpis audit` — incongruence findings
  - `delendai kpis efficiency --window-days=7`
  - `delendai kpis usage --watch` — refresh loop
  - `delendai kpis summary --threshold=calls<10` — fail CI on breached threshold
- **VS Code**: the Project KPIs view (`delendai.kpis`); the status bar
  exposes the overall score and links to the dashboard.

## Enabling the plugin

`delendai.config.json` wires the plugin (and its dependencies
`usage-tracking` and `project-health`):

```json
"plugins": {
  "usage-tracking": { "options": {} },
  "project-health": { "options": {} },
  "project-kpis": { "options": {} }
}
```

Once enabled, snapshots accumulate over time; history, trends and the audit
view become evidence-backed as more samples are persisted.
