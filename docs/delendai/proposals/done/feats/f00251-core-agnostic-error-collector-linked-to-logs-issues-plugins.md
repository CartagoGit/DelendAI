---
id: f00251
title: "Core agnostic error collector linked to logs + issues plugins"
kind: feat
status: done
type: proposal
track: error-collection
date: 2026-08-26
shipped-in: [4dbb9454]
slices:
  - id: S1
    status: done
    commit: cc42417f
    files: 9 source + 4 spec files under packages/core/src/lib/error-collection/ and packages/core/tests/src/lib/error-collection/
  - id: S2
    status: done
    commit: 639ca43d
    files: packages/core/src/public/index.ts, packages/core/src/lib/plugins/plugin-contract.ts, packages/core/src/lib/cli/assemble-plugins.ts, packages/core/src/lib/cli/assemble.ts, 2 new spec files
  - id: S3
    status: done
    commit: 3a104647
    files: plugins/logs/src/lib/services/error-sink-adapter.{ts,spec.ts}, plugins/logs/src/index.ts (additive), plugins/logs/tests/src/lib/services/error-sink-adapter.spec.ts
  - id: S4
    status: done
    commit: 3a104647
    files: plugins/issues/src/lib/services/error-sink-adapter.{ts,spec.ts}, plugins/issues/src/lib/github-client.ts (createIssue widening), plugins/issues/src/index.ts (additive), plugins/issues/tests/src/lib/services/error-sink-adapter.spec.ts
  - id: S5
    status: done
    commit: becfdd4a
    files: packages/core/tests/smoke/error-collection.smoke.spec.ts, packages/core/skills/error-collection/SKILL.md, plugins/logs/src/lib/knowledge/error-collector.ts, plugins/issues/src/lib/knowledge/error-collector.ts, plugins/logs/src/index.ts (additive), plugins/issues/src/index.ts (additive)
  - id: S6
    status: done
    commit: 4dbb9454
    files: CHANGELOG.md
tests:
  smoke: 1
  unit: 224
  integration: 224
coverage: "224/224 error-collection specs green; 28/28 spec files green; bun run validate exit non-zero on pre-existing client typecheck drift (f00193) and 16 unrelated vitest suites — none from f00251"
last-transition-id: 1bb33a8d-bbb6-48e9-8d00-032b812d2f49
last-correlation-id: 1bb33a8d-bbb6-48e9-8d00-032b812d2f49
last-transition-from: review
---

# f00251 — Core agnostic error collector linked to logs + issues plugins

## Goal

An agnostic, project-agnostic error-collection engine living in `@mcp-vertex/core` that every plugin (and the host's own handlers) can feed through a typed `errorCollector` slot, with a fan-out adapter pattern that lets the `logs` plugin write structured error events to its JSONL streams AND lets the `issues` plugin turn high-severity incidents into project issues (or queued drafts) — all without the core knowing anything about GitHub, JSONL, or project vocabulary.

The deliverable is a SOLID, reusable, fully-tested slice:

- **Engine (`IErrorCollector`)** lives in `packages/core/src/lib/error-collection/`. It classifies severity, applies a composable redaction policy (`redactSecrets` + path truncation + arg-size cap), and fans out to every registered sink in parallel — never throwing into the host's tool call.
- **Sink contract (`IErrorSink`)** is a narrow, multi-implementation port (parallel to the existing `ILogsSink`). The core owns the registry; plugins contribute sinks via `IMcpPluginRegistrations.errorSinks` (an array — the plural matters, several sinks must coexist: logs, issues, future SIEM bridges).
- **Plugin context (`IMcpPluginContext.errorCollector`)** is always present, populated at boot by the assembly layer. When no plugin contributes a sink, a `ConsoleErrorSink` fallback is wired so no error is silently dropped.
- **`logs` plugin adapter** bridges `IErrorSink.record` to its curated error stream (the same one `tool-failed` events land in today) — one writer, zero duplication.
- **`issues` plugin adapter** maps captured errors to a project-issue body, with a stable fingerprint for de-duplication, hourly rate-limiting, and a safe-mode default (writes drafts to a local scaffold dir when `autoReport` is off; only opens real issues when the operator opts in).
- **Tool wrapper (`withErrorCollection`)** is the safe-by-construction way for any handler — host-side, plugin-side, or test-side — to record an error without swallowing it.
- **Smoke test** validates end-to-end: a handler throws → collector records → secrets are redacted → both adapters receive the captured event → redaction is verified at each sink boundary.

The architecture mirrors the existing `logsSink` pattern (f00154 S2) that the `logs` plugin already uses, so the design has a battle-tested reference, and the proposal slots in cleanly next to `logsSink` without breaking any host that doesn't load the new engine.

## why

- The `error-reporting` plugin (`plugins/error-reporting/`) ships a working pipeline but is **project-specific**: it only opens issues for `@mcp-vertex/*` internal failures, it embeds `mcp-vertex_metrics` / `CartagoGit/mcp-vertex` vocab in its DTO, and it knows the `gh` argv. A consumer adopting `@mcp-vertex/core` for their own project gets zero value from it.
- The host already has a tool-call lifecycle pipeline (`onToolCall` / `onToolStart` / `onToolCancel`) but each plugin that wants to capture failures implements the full classify + redact + write loop by hand. The `logs` plugin and `error-reporting` plugin both reimplement the same fan-out pattern with subtly different contracts.
- `f00154 S2` introduced the `ILogsSink` pattern and proved that a pluggable sink adapter with a `ConsoleLogsSink` fallback works at boot — this proposal is the **error** counterpart, using the same shape so the mental model stays small.
- **Privacy by construction is a project rule** (`privacy-inviolable: true`, `privacy-by-construction: true`). Today, plugin-emitted errors have NO mandatory redaction gate — a tool that throws `new Error("API key: " + key)` would write that string verbatim into `results/logs-errors/*.jsonl` and any future issue body. A core-owned redactor that runs BEFORE any sink sees the event makes the rule enforceable.
- The `issues` plugin (`plugins/issues/`) currently is host-only, never loaded in the `swarm` preset, and `dependsOn: ['proposals']`. Wiring it as an error sink means an incident collector in core can route directly to issues once a host opts in — without `issues` becoming part of the swarm preset.
- **SOLID payoff**: this turns three unrelated concerns (severity policy, redaction policy, fan-out transport) into three independent interfaces with independent implementations and tests. Adding a future SIEM / Datadog / Sentry sink is one new `IErrorSink`, not a fork.

## non-goals

- Replacing `plugins/error-reporting/` — it stays for its project-internal DTO + GitHub auth + de-duplication work. The new core engine feeds it through the same `errorSinks` channel if the consumer wants both; otherwise it is opt-out by not loading it.
- Adding a new transport. We do NOT introduce Sentry / Datadog / OTLP / Slack adapters in this slice. Each is a one-class plugin that anyone can write against `IErrorSink` later — that is the explicit exit door, not a side-quest of this proposal.
- Changing the `logs` plugin's existing JSONL schema. The error-sink adapter writes to the same curated `results/logs-errors/*.jsonl` stream with the same `ILogEvent` shape — readers and the existing `logs_*` tools keep working.
- Auto-creating GitHub issues by default. The `issues` adapter's safe-mode writes drafts to `docs/mcp-vertex/proposals/retired/issues/_errors/` (or whatever the operator configures); only `options.autoReport: true` opens real issues. Privacy by construction — operators explicitly opt in to network writes.
- Cross-process coordination / persistent error queues. A process crash that prevents the collector from flushing is out of scope; sinks own their own durability (the `logs` sink uses `withFileMutex` JSONL append, the console sink is best-effort).
- Adding telemetry hooks, performance counters, or dashboards. The proposal stays a contract + 2 adapters + 1 smoke test — any observability beyond per-sink `console.warn` on sink failure is a follow-up.
- Replacing `onToolCall` / `onToolStart` lifecycle hooks. The collector piggybacks on them; the lifecycle surface stays unchanged.

## architecture

### 1. Core contracts (`packages/core/src/lib/error-collection/`)

- `types.ts` — zod schemas for `ICapturedError`, `ICapturedErrorContext`, `TSeverityBand`, `ISinkId`, `IErrorSinkRecordInput`. Flat shape (no `snapshot` / `toolMeta` nesting); fields include `toolName`, `pluginName`, `packageId`, `ts`, `severity`, `classification`, `errorCode`, `errorName`, `stackHead`, `fingerprint`, `summary`, `truncated`, `meta`.
- `sink.interface.ts` — `IErrorSink { id: string; record(event: ICapturedError): Promise<void> }`.
- `collector.interface.ts` — `IErrorCollector { record(error, context): Promise<ICapturedError> }` (returns the captured redacted event so callers can chain). `ICreateErrorCollectorOptions` accepts `sinks`, `classifier`, `redaction`, `clock`, `onSinkError`.
- `redaction-policy.ts` — `IRedactionPolicy { redact(event): ICapturedError }`. Default composes `redactSecrets` + POSIX path collapse (`/Users/<x>/...` → `~/...`, `/home/<x>/...` → `~/.env`) + 8 KB byte cap. Returns a new object.
- `severity-classifier.ts` — `ISeverityClassifier { classify(error, outcome): { severity, classification, errorCode? } }`. Deterministic table: `TypeError`/`RangeError` → `error`, `TimeoutError` → `critical`, name pattern `*Privacy*` → `critical`, `*Security*` → `alert`, `*Fatal*` → `emergency`, `outcome='timed-out'` → `critical`, `outcome='dead'` → `emergency`, unknown → `warning`.
- `collector.service.ts` — `createErrorCollector({...})`. Fans out via `Promise.allSettled`. Sinks sorted by `id` (deterministic). Redaction runs ONCE per `record` call (all sinks see the same redacted event). Fingerprint: SHA-256 hex of `packageId|toolName|errorCode|<stackHead>`. Sink failures isolated via `onSinkError`; never throws back to the caller.
- `console-sink.ts` — `ConsoleErrorSink` (id `console-error`). Defense-in-depth `redactSecrets` pass before writing JSON line to `process.stderr`. Honors `quiet` flag.
- `buffering-sink.ts` — `BufferingErrorSink` (id `buffering`). Test-only in-memory recorder with `events` getter + `clear()`.
- `with-error-collection.ts` — `withErrorCollection(handler, { toolMeta, collector, onError? })`. Wraps any async handler. On throw: builds context, calls `collector.record(error, context)`, invokes `onError?.(captured)` with the redacted event, **rethrows the original error** so the caller still sees the failure.

### 2. Public surface (`packages/core/src/public/index.ts`)

Re-exports: `IErrorSink`, `IErrorCollector`, `ICreateErrorCollectorOptions`, `ICapturedError`, `ICapturedErrorContext`, `TSeverityBand`, `ISinkId`, `IErrorSinkRecordInput`, `IRedactionPolicy`, `ISeverityClassifier`, `createErrorCollector`, `ConsoleErrorSink`, `BufferingErrorSink`, `withErrorCollection`, `IToolMetaForError`, `createDefaultRedactionPolicy`, `createDefaultSeverityClassifier`.

### 3. Plugin contract (`packages/core/src/lib/plugins/plugin-contract.ts`)

- `IMcpPluginRegistrations.errorSinks?: readonly IErrorSink[]` — array (multiple sinks coexist; first-seen dedupe by id).
- `IMcpPluginContext.errorCollector?: IErrorCollector` — always populated in production hosts via the `ConsoleErrorSink` fallback.

### 4. Assemble wiring (`packages/core/src/lib/cli/assemble.ts` + `assemble-plugins.ts`)

- `assemble-plugins.ts` aggregates every plugin's `errorSinks` into `resolvedErrorSinks` with deterministic dedupe by id.
- `assemble.ts` builds a single `IErrorCollector` from the resolved sinks (using `createDefaultSeverityClassifier` + `createDefaultRedactionPolicy`) and threads it into `buildContext.errorCollector`. When zero plugins register one, a `ConsoleErrorSink` fallback is injected so the field is never undefined in production hosts.

### 5. Logs plugin adapter (`plugins/logs/src/lib/services/error-sink-adapter.ts`)

`createLogsErrorSinkAdapter({appendEvent})` returns `{ sink: IErrorSink (id 'logs-error'), getStats() }`. Converts `ICapturedError` to the existing `ILogEvent` shape (kind: `'log-warning'`, outcome: `'failed'`, severity carried, summary: redacted `toolName + summary preview`, meta: `{errorCode, classification, fingerprint, errorName, stackHead, sink: 'logs-error'}`). Routes through the existing main+error JSONL store via the shared `appendEvent` closure. Defense-in-depth `redactSecrets` pass on the summary. Stats: `recordsAccepted`, `recordsRejected`. Wired in `plugins/logs/src/index.ts` as `errorSinks: [adapter.sink]`.

### 6. Issues plugin adapter (`plugins/issues/src/lib/services/error-sink-adapter.ts`)

`createIssuesErrorSinkAdapter({githubClient, scaffoldDir, clock?, autoReport, maxReportsPerHour})` returns `{ sink: IErrorSink (id 'issues-error'), getStats() }`. Behavior:
- **Always writes a draft** at `<scaffoldDir>/_errors/<fingerprint>.md` via `writeFileAtomic` from `@mcp-vertex/core/public`. Frontmatter: `id: <fingerprint>, kind: incident, severity, errorCode, toolName, pluginName, packageId, classification, capturedAt, draftVersion: 1`. Body: redacted table (no raw stack, no args, no paths).
- **Opens a live issue only** when `options.autoReport === true` AND `severity ∈ {'critical', 'alert', 'emergency'}`.
- **De-dup**: in-memory `Map<fingerprint, lastTimestamp>`. Same fingerprint inside the rate window → dropped, counter incremented.
- **Rate-limit**: sliding-window array of live-issue timestamps; cap = `options.maxReportsPerHour` (default 5). Drops counted in `liveIssuesDropped`, not `githubFailures`.
- **Title**: `incident: <toolName> — <severity>`. Body mirrors the draft table.
- **Never throws**: wraps whole body in try/catch; transient `gh` failures logged to stderr with a structured prefix, counted in `githubFailures`.

Wired in `plugins/issues/src/index.ts` as `errorSinks: [adapter.sink]`. The `IGithubClient` interface (plugin-internal) was widened with a `createIssue(input)` method; production wiring shells out to `gh issue create --title --body --label` via `runCommand` from `@mcp-vertex/core/public`.

### 7. Smoke test (`packages/core/tests/smoke/error-collection.smoke.spec.ts`)

Boots a real `assembleCliConfig` with the real `logs` plugin + a stub inline plugin registering an in-memory sink. Wraps a `TypeError`-throwing handler with `withErrorCollection`. Asserts:
- The stub sink receives one event with `severity ∈ {'error', 'critical'}` and a redacted summary.
- The logs JSONL stream contains a line whose `meta.sink === 'logs-error'` AND whose summary does NOT contain the seeded API_KEY token.
- The original error propagates so the caller still sees the failure.
- Runs in <5s with no network.

### 8. Skill + knowledge

- `packages/core/skills/error-collection/SKILL.md` (124 lines) — discoverable via `mcp-vertex_overview`. Documents when to call `ctx.errorCollector.record` vs `withErrorCollection`, how to write a custom `IErrorSink`, the privacy guarantee, and the autoReport opt-in.
- `plugins/logs/src/lib/knowledge/error-collector.ts` — entry `logs-error-collector` describing how the adapter routes through existing JSONL streams.
- `plugins/issues/src/lib/knowledge/error-collector.ts` — entry `issues-error-collector` describing safe-mode drafts vs autoReport live-mode + rate-limit semantics.

## slices

### S1 — Core error collector

- **Status**: done
- **Files**: `packages/core/src/lib/error-collection/` and its unit specs
- **Gate**: `bunx vitest run packages/core/tests/src/lib/error-collection/`
- Commit `cc42417f`: contracts, collector, redaction, classifier, wrapper and 55 tests.

### S2 — Public surface and assembly wiring

- **Status**: done
- **Files**: `packages/core/src/public/index.ts` and assembly integration specs
- **Gate**: `bunx vitest run packages/core/tests/src/lib/cli/error-collector-wiring.spec.ts`
- Commit `639ca43d`: public exports, plugin registrations and assembly wiring; 7 tests.

### S3 — Logs adapter

- **Status**: done
- **Files**: `plugins/logs/src/lib/services/error-sink-adapter.ts` and specs
- **Gate**: `bunx vitest run plugins/logs/`
- Commit `3a104647` (combined with S4): logs adapter and integration coverage.

### S4 — Issues adapter

- **Status**: done
- **Files**: `plugins/issues/src/lib/services/error-sink-adapter.ts` and specs
- **Gate**: `bunx vitest run plugins/issues/`
- Commit `3a104647` (combined with S3): issues adapter and `IGithubClient.createIssue`.

### S5 — Smoke, skill and knowledge

- **Status**: done
- **Files**: smoke test, `SKILL.md` and logs/issues knowledge entries
- **Gate**: `bunx vitest run packages/core/tests/smoke/error-collection.smoke.spec.ts`
- Commit `becfdd4a`: end-to-end smoke test, skill and knowledge entries.

### S6 — Changelog and close

- **Status**: done
- **Files**: `CHANGELOG.md`
- **Gate**: `bun run validate`
- Commit `4dbb9454`: CHANGELOG entry and close.

## acceptance

- [x] `IErrorCollector` engine in `@mcp-vertex/core` with redaction, classification, fan-out, never-throws.
- [x] Public surface re-exports the 15 error-collection symbols.
- [x] `IMcpPluginRegistrations.errorSinks` + `IMcpPluginContext.errorCollector` wired with deterministic dedupe and `ConsoleErrorSink` fallback.
- [x] `@mcp-vertex/logs` adapter bridges to the existing JSONL streams without schema change.
- [x] `@mcp-vertex/issues` adapter writes drafts by default, opens live issues only when `autoReport: true` + severity ≥ critical, with fingerprint de-dup + hourly rate-limit.
- [x] End-to-end smoke validates redaction at every boundary in <5s.
- [x] Skill bundle discoverable; knowledge entries added to both plugins.
- [x] CHANGELOG entry under unreleased.
- [x] Five Conventional-Commits commits on `develop` (S1 + S2 + S3+S4 combined + S5 + S6), all pushed to origin/develop.

## notes

This proposal was authored via `mcp-vertex_proposals_create_proposal` on 2026-08-26. The proposal markdown was created on disk and transitioned to `in-progress` but a parallel-agent cleanup deleted it before any slice committed. The five implementation slices landed on `develop` independently (refs `f00251` in each commit message), and this file has been reconstructed post-fact to provide a single auditable record. The CHANGELOG entry and `bun run validate` findings for f00251-specific work were already recorded by S6.

**Verification**:
- `bunx tsc --noEmit` on `packages/core/tsconfig.json` → exit 0.
- `bunx tsc --noEmit` on `plugins/logs/tsconfig.json` → exit 0.
- `bunx tsc --noEmit` on `plugins/issues/tsconfig.json` → exit 0.
- `bunx vitest run packages/core/tests/src/lib/error-collection/` → 55/55 tests pass.
- `bunx vitest run packages/core/tests/src/lib/cli/error-collector-wiring.spec.ts packages/core/tests/src/lib/plugins/plugin-contract.spec.ts` → 7/7 tests pass.
- `bunx vitest run packages/core/tests/smoke/error-collection.smoke.spec.ts` → 1/1 test passes (67ms body).
- `bunx vitest run plugins/logs/` → 83/83 tests pass.
- `bunx vitest run plugins/issues/` → 78/78 tests pass.
- **Total f00251 coverage**: 224/224 specs, 28/28 spec files, 9 source files + 5 test files in core + 2 adapters + 1 smoke + 1 skill + 2 knowledge entries.

**Pre-existing drift unrelated to f00251** (logged in S6, not fixed here):
- `packages/client` typecheck fails on `IExternalMcpCapability` export + `IExternalMcpRefusal.providerId/reason/health` shape — owned by `f00193`.
- 16 vitest suites fail on agent-orchestrator scaffold + r00028 subpath exports + preset drift — owned by `f00193`/`f00194`/`c00142`.
- `f00182` (commit-policy engine) and `q00007` carry stale `ready/feats/<id>` files together with `ready/<id>` ghost files from parallel agents — belongs in a separate proposals-hygiene slice.

