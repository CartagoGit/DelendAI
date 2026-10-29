---
id: f00153
title: "incident-driven logs — severity taxonomy + logs_log + logs_search + logs_incidents"
kind: feat
status: done
type: proposal
track: plugins/logs
date: 2026-07-26
---

# f00153 — Incident-driven logs

## Goal

Convert the `logs` plugin from a passive transcript into an **incident detection system** that lets any agent (or any caller) record, search, and retroactively identify recurring errors without crawling raw JSONL files.

The plugin currently exposes six tools (`query`, `tail`, `errors_tail`, `subscribe`, `correlate`, `redact_test`) and a 7-string `outcome` enum (`ok`, `failed`, `timed-out`, `cancelled`, `dead`, `idle`, `unknown`). What it does **not** have, and what the user-facing workflow needs:

1. A **severity** field on every event with the standard syslog 7-level taxonomy (`debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`).
2. An **incident-type** code on every event, distinct from the lifecycle `kind` (e.g. `lock-conflict`, `validation-failure`, `type-error`, `state-inconsistency`, `quality-run-failed`, `secret-detected`).
3. A **write-side** tool (`logs_log`) so any plugin, host or MCP agent can record an incident with structured severity, type, message, files, agent and context — without having to write JSONL into the cache directly.
4. A **content-search** tool (`logs_search`) that does full-text / regex matching across `summary`, `meta.error.message`, `meta.error.stack`, `meta.args` and `meta.result` — `query` only filters by metadata.
5. An **auto-detector** (`logs_incidents`) that clusters failing events by `(toolName, hash(error.message))` and returns recurring-incident groups with counts, distinct agents, first-seen, last-seen, sample summary and recent events. This is the "retroalimentación" loop the user is asking for: an agent can ask "¿qué errores se repiten en los logs?" and get a structured answer.

The proposal is **backwards-compatible** — the existing six tools keep their shape and only gain two fields (`severity`, `incidentType`) on each event they return. The retention, redaction and rotation invariants stay intact.

## Why

The logs plugin is hooked into every tool call across every plugin via `onToolStart` / `onToolCall` / `onToolCancel`, so it already captures every error a caller emits. But the surface is read-only at the metadata level: an agent that suspects "something is broken in `proposals_agent_lock`" cannot currently ask the logs plugin a semantic question — it has to know the right `kind` / `outcome` filter, call `errors_tail` with a high `limit`, then read the raw `meta` field by hand.

Three concrete failure modes the user wants solved:

- **Cross-agent feedback loop is missing.** When peer agent A leaves a state that breaks agent B twenty minutes later, agent B has no way to ask "has anyone else hit this?" — it can `errors_tail` but cannot group by signature. Result: every agent re-discovers the same bug.
- **Logs classify outcome but not severity.** A `cancelled` outcome (benign — user pressed escape) and a `dead` outcome (the agent died) live in the same `not ok` bucket of `errors_tail`. The operator cannot ask "show me only critical events" without doing it by hand.
- **Other plugins cannot emit incidents.** The notifications, proposals, quality and security plugins all have error paths that the user wants surfaced as structured incidents with the same severity colour as tool-call failures. Today they either write to their own private JSONL or surface as console lines that never get correlated.

The asymmetry is the issue: the logs plugin is a perfect read-side for tool-call failures (hooks catch them automatically) but a near-zero write-side for everything else. Fixing the asymmetry is what unblocks the self-correction loop.

## Why this design

Three independent additions, each at the smallest layer that buys the property:

- **Severity taxonomy** lives on `ILogEvent` itself, not as a separate index. A separate index would diverge from the JSONL the moment a fatal event is logged without a re-index pass; embedding the field is one schema change, zero new files.
- **Incident-type** is a stringly-typed code with a `kind → incidentType` default table plus an explicit override on `logs_log`. The lifecycle `kind` is too coarse (there are 20 of them, mostly hook names), but binding the type too tightly to lifecycle would lose the project's freedom to add new hooks. A string is the cheapest thing that lets the operator pin arbitrary codes (e.g. `secret-detected`) without a plugin update.
- **`logs_log` accepts a `context` object** rather than a flat schema. The natural call site is `ctx.logs.log({ severity: 'critical', incidentType: 'state-inconsistency', message: '…', files: [...], context: { ... } })` — the caller already has whatever shape they want to attach; we should not force them through a Zod cliff. The context object lands verbatim in `meta.context`.
- **`logs_incidents` clusters by `(toolName, hash(error.message))`** rather than by free-text similarity. The hash makes the cluster deterministic and the cardinality manageable; the tool-name prefix keeps unrelated failures from collapsing into one cluster. Tooling that wants semantic similarity can layer on top later — the deterministic clusters are the cheap primitive everyone needs first.
- **Cross-plugin welfare via `ctx.logs.log`** is opt-in per plugin. Today every plugin has access to `ctx.workspace`, `ctx.options`, `ctx.cacheEvictionRegistry` — adding `ctx.logs` is just one more line in the register hook. No plugin is forced to migrate; the new helper is purely additive.

## Non-goals

- It does **not** introduce a separate alerting / paging system — severities are a taxonomy, not a notification fan-out. The notification plugin is the right place for fan-out and lives outside this proposal.
- It does **not** ship semantic clustering (embeddings, similarity, etc.) — `logs_incidents` is deterministic on `(toolName, error.message hash)`. Semantic similarity is a separate, much larger slice.
- It does **not** retroactively re-tag the existing JSONL files — every existing event gets `severity` + `incidentType` on its next read, derived from `outcome` + `kind` (so old data is queryable in the new shape without a migration script).
- It does **not** add a UI / dashboard — the tools are MCP tools, consumed by agents. A dashboard is a separate concern.
- It does **not** migrate other plugins to use `ctx.logs.log` automatically — that is a per-plugin follow-up each owner can take when convenient. S4 only wires the helper and updates the documentation knowledge.
- It does **not** change retention semantics — the new fields ride the existing JSONL streams unchanged.

## Slices

- global_gate: validate

### S1 — Severity taxonomy + `incidentType` on `ILogEvent`

- **Status**: done
- **Files**: `plugins/logs/src/lib/services/normalize-event.ts` (extend `ILogEvent` with `severity: LogSeverity` + `incidentType: string | null`; add `LogSeverity` enum; expose `IncidentType` type), `plugins/logs/src/lib/services/kinds.ts` (new — `kind → incidentType` default table; `severityForOutcome()` mapper), `plugins/logs/src/lib/services/normalize-event.spec.ts` (new — coverage for all 7 severities and the 20 kinds), `plugins/logs/src/lib/tools/tools.ts` (extend `LogEventSchema` with the two fields), `plugins/logs/tests/src/lib/services/normalize-event.spec.ts` (extend existing tests).
- **Gate**: type + verify
- **Acceptance**:
  - `ILogEvent` gains `readonly severity: LogSeverity` and `readonly incidentType: string | null`.
  - `LogSeverity = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'`, exported from `@mcp-vertex/logs` public types.
  - `severityForOutcome(outcome)` maps: `ok` → `info`, `idle` → `info`, `failed` → `error`, `timed-out` → `error`, `cancelled` → `notice`, `dead` → `critical`, `unknown` → `warning`.
  - `kinds.ts` exposes `KIND_TO_INCIDENT_TYPE: Record<LogEventKind, string>` with explicit codes; `normalizeEvent` uses it as the default, falling back to `null` when the kind is unknown.
  - Existing `query` / `tail` / `errors_tail` / `correlate` / `subscribe` outputs now include `severity` and `incidentType` on every event — verified by extending their existing output-shape tests.
  - **No** JSONL migration script — old events read with the new code are projected on the fly.

### S2 — `logs_log` (write-side) + `logs_search` (content search)

- **Status**: done
- **Files**: `plugins/logs/src/lib/tools/tools.ts` (add two new tool registrations: `log` and `search`), `plugins/logs/src/lib/services/log-store.ts` (add `appendEvent` reader-only alias if needed; expose existing `appendEvent` for the write-side), `plugins/logs/src/lib/services/log-search.ts` (new — regex / text scan over `summary`, `meta.error.message`, `meta.error.stack`, `meta.args`, `meta.result`), `plugins/logs/src/lib/services/log-store.spec.ts` (extend), `plugins/logs/tests/src/lib/tools/log-tool.spec.ts` (new), `plugins/logs/tests/src/lib/tools/search-tool.spec.ts` (new).
- **Gate**: type + verify
- **Acceptance**:
  - `logs_log` input schema: `{ severity: LogSeverity, incidentType: string, message: string, files?: string[], agent?: string, context?: Record<string, unknown> }` (all fields except `severity`, `incidentType`, `message` are optional). Output: `{ ok: true, ts: string, incidentType: string }`. Validates that `incidentType` is a non-empty `^[a-z][a-z0-9-]{0,63}$` slug.
  - `logs_log` writes to the **main** stream (not the error stream — the severity already tells the operator whether it is an incident; duplicating into the error stream would skew curated tallies).
  - `logs_search` input schema: `{ pattern: string, caseSensitive?: boolean, isRegex?: boolean, scope?: 'summary' | 'error' | 'args' | 'result' | 'all', limit?: number, since?: string, until?: string }`. Defaults to `caseSensitive: false`, `isRegex: false`, `scope: 'all'`, `limit: 100`.
  - `logs_search` returns `{ events: LogEvent[], matched: number, hasMore: boolean }`. Grep falls back to substring on `caseSensitive: false`; PCRE-style regex when `isRegex: true` (compiled with try/catch, error message returned as `toolError`).
  - Output schemas for both tools are strict and pass the `verify:tools` matrix.
  - Tests cover: write+read round-trip on `logs_log`; regex search across each scope; case-sensitive default; bad regex returns a structured error.

### S3 — `logs_incidents` (auto-detector) + projection of new fields across all tools

- **Status**: done
- **Files**: `plugins/logs/src/lib/services/log-incidents.ts` (new — clustering logic), `plugins/logs/src/lib/tools/tools.ts` (add `incidents` tool registration; extend `LogEventSchema` projection to `query`/`tail`/`errors_tail`/`correlate`/`subscribe` outputs), `plugins/logs/tests/src/lib/services/log-incidents.spec.ts` (new), `plugins/logs/tests/src/lib/tools/incidents-tool.spec.ts` (new).
- **Gate**: type + verify
- **Acceptance**:
  - `logs_incidents` input schema: `{ since?: string, until?: string, minCount?: number, agent?: string }` (defaults: `minCount: 2`).
  - Reads from the **errors stream only** (curated subset of events whose outcome is not `ok`/`idle`). The main stream is too noisy; the curated subset is what the operator cares about.
  - Clustering key: `toolName + '|' + sha1(error.message)`. (sha1 is the right primitive here — message is already redacted and content-deterministic, so we do not need cryptographic strength.)
  - Output schema: `{ incidents: Array<{ incidentType: string, toolName: string, count: number, distinctAgents: number, firstSeen: string, lastSeen: string, sampleSummary: string, sampleError: string, recentEvents: LogEvent[] }>, totalIncidents: number }`. `recentEvents` keeps the last 5.
  - `sampleError` is the canonical error message (first occurrence).
  - Filtering by `minCount` drops singleton clusters; `agent` filters the input set before clustering.
  - The `severity` + `incidentType` fields added in S1 are now projected in every existing tool's output; existing tests are updated to assert presence.

### S4 — Cross-plugin `ctx.logs.log` helper + knowledge update

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/plugin-context.ts` (or equivalent — add `logs?: { log(input): Promise<void> }` to the plugin context), `plugins/logs/src/index.ts` (the `register()` hook now exposes `logs` to downstream plugins via `ctx`; the helper is just a thin wrapper around the same `appendEvent` used internally), `plugins/logs/src/lib/knowledge/logs-knowledge.ts` (new — extracted from the existing inline body in `index.ts`), `plugins/logs/src/index.ts` (rewrite the inline `knowledge` body to delegate to the new module), `plugins/logs/README.md` (document the new tools).
- **Gate**: type + docs
- **Acceptance**:
  - `IMcpPluginContext.logs` is conditional (`logs?: ...`) — only present when the `logs` plugin is loaded. Plugins that want to log incidents already do `ctx.options.featureFlags?.enableLogs ?? false` today; the helper is opt-in by checking `ctx.logs !== undefined`.
  - The existing inline `body: [ '# Operational event log', … ].join('\n')` block in `plugins/logs/src/index.ts` is replaced with a `logs-knowledge.ts` export that documents: the new severity taxonomy, the new `incidentType` field, the three new tools (`log` / `search` / `incidents`), and a "how to find recurring incidents" recipe.
  - `plugins/logs/README.md` lists all 9 tools with input / output schemas.
  - No plugin is migrated to use `ctx.logs.log` in this proposal — that is a per-plugin follow-up. S4 only proves the helper works end-to-end with a one-line call in the `logs` plugin itself (a `tool-warning` warning is logged on each `onToolStart` to demonstrate the round-trip).

## Acceptance

- `bun run validate` → exit 0; new tools are wired and green; `verify:tools` matrix includes `log`, `search`, `incidents` with both schema-canonical and edge inputs.
- `logs_query` on a sample event returns `{ severity: 'error', incidentType: 'tool-failure', … }` for a tool-failed event — verified by `normalize-event.spec.ts` + `tools.spec.ts`.
- `logs_log` round-trip: write an incident with severity `critical`, then `logs_query` with `kind: 'incident-logged'` returns it with the same severity, incidentType and message.
- `logs_search` with regex `lock.?conflict` returns every matching event across all five scopes; with `scope: 'error'` scopes the search to `meta.error.message` + `meta.error.stack`.
- `logs_incidents` on a synthetic error stream with 3 lock-conflict events from 2 different agents returns one cluster `{ incidentType: 'lock-conflict', toolName: 'proposals_agent_lock', count: 3, distinctAgents: 2, … }`.
- The plugin's `knowledge` body documents the new taxonomy and the new tools, with a worked example.

## Notes

### Migration cost

The schema migration is mechanical: every `ILogEvent` literal in the test suite gains two fields. The handler surface gains three tool registrations (each ~30 lines of Zod + handler). One new service module (`log-incidents.ts`, ~80 lines). One new service module (`log-search.ts`, ~60 lines). One new knowledge module (`logs-knowledge.ts`, ~50 lines). Estimated: ~350 lines of prod code + ~400 lines of tests across S1–S4.

### Why this is not overkill

The logs plugin already pays the cost of two JSONL streams, retention, redaction, and 6 tools. The auto-detector is the read-side primitive that lets an agent close the loop without re-implementing the clustering. The severity taxonomy is the metadata that lets a human (or LLM) ignore `info` noise and focus on `critical`/`alert`. The write-side `logs_log` is the symmetric primitive that lets every plugin participate. Each is a small addition; together they convert the logs from a transcript into a system.

### Prior art

- **syslog severity** (RFC 5424) — the canonical 8-level taxonomy; this proposal uses 7 of the 8 (drops `informational`).
- **OpenTelemetry severity** — sibling taxonomy with similar mapping rules; this proposal is syslog-based for alignment with the host operator's existing mental model.
- **Sentry issue grouping** — `logs_incidents` collapses multiple events into one cluster with `(toolName, error.message hash)`, mirroring Sentry's `(transaction, errorClass, message)` grouping.
- **GitHub Actions annotation levels** — `notice` / `warning` / `error` map cleanly into the same taxonomy.
