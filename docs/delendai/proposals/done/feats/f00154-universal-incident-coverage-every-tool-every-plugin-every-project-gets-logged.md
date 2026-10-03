---
id: f00154
title: "universal incident coverage — every tool, every plugin, every project gets logged"
kind: feat
status: done
type: proposal
track: packages/core+plugins/logs+all
date: 2026-07-26
---

# f00154 — Universal incident coverage

## Goal

Make **every** tool call, **every** plugin error, **every** project that consumes `@mcp-vertex/core` end up in the redacted event log **without any of them writing a single line of incident code**. The output is one consistent surface — the existing `logs_query` / `logs_search` / `logs_incidents` tools plus the `logs_tail` / `logs_errors_tail` fast paths — that catches:

- Errors from any of the 41 plugins in `plugins/` (currently only `logs` and `proposals` surface through the JSONL streams; the other 39 return `toolError` but never emit a structured incident).
- Errors from any tool the user authors in a third-party project that consumes `@mcp-vertex/core` (today the only way to get a structured log is to call `logs_log` explicitly).
- Tool calls that timed out, got cancelled, or where the host's redaction is insufficient.

The mechanism is two-layered and **opt-out by default**, so the "I don't want noise" case is one config line:

1. **Core hook layer** — every MCP server the core boots, regardless of which plugins it loaded, gets the **same** tool-call lifecycle hooks the `logs` plugin already consumes. When the `logs` plugin is loaded, the core forwards those hooks to it; when it is not, the core emits a structured incident via a built-in `console-backed` writer that the host can swap for any sink.
2. **Plugin automatic-emit layer** — every `toolError(...)` path in core helpers and every plugin tool runs a tiny adapter (`withIncidentLogging`) that, when `ctx.logs` is present, calls it with a stable `incidentType` (e.g. `tool-failure`, `state-inconsistency`, `validation-failure`). Plugin authors can still add finer-grained `ctx.logs?.log(...)` calls for things only the plugin knows.

Both layers are gated on the `logs` plugin being loaded (the "logs sink" abstraction is what the core hook calls into). When the host picks `--plugins=foo,bar,baz` and the `logs` plugin is **not** in the list, the core still records everything to its built-in console writer so nothing is lost — the operator just has to scrape stdout.

## Why

f00153 closed the **read-side** gap (9 tools, severity taxonomy, auto-detector, cross-plugin helper). It left three loose ends on the **write-side** that the user is asking us to close:

1. **Plugin authors do not call `ctx.logs.log()`** — they return `toolError(...)` and stop. Today 39 of 41 plugins do exactly that. Every `toolError` is invisible to `logs_incidents` and to any agent that asks "¿qué falla ahora?" without a separate `errors_tail` pass.
2. **Third-party plugin authors cannot import `IPluginLogInput`** — the type lives in `packages/core/src/lib/plugins/plugin-contract.ts` (internal path). `@mcp-vertex/core/public` does not re-export it. A consumer writing a plugin in another project compiles against `unknown` or hand-rolls the type, then discovers at runtime that the shape drifted.
3. **The "logs sink" assumption is implicit** — `ctx.logs` is `undefined` whenever the `logs` plugin is not in the load set. That is fine, but the *core* has no other sink; if the host forgets `--plugins=logs`, the tool-call lifecycle hooks are dead code and the operator gets a silent zero events.

The user's words — "para que el repo completo y los plugins también, reporten los logs como deberían, y que si creamos plugins en otros proyectos que consuman mcp-vertex también reporten logs directamente sin tener que programarlos allí" — translate to: every tool surface, whether inside this monorepo or in a third-party project, must report without the plugin author having to program anything. The "without programming" is the bar; the answer is to make the *core* the writer, not the plugin.

## Why this design

Three independent guarantees, each at the smallest layer that buys the property:

- **Re-export the helper from `@mcp-vertex/core/public`.** A third-party plugin author imports `IPluginLogInput, IPluginLogsHelper, LogSeverity, IncidentType` and types their own `ctx.logs.log(...)` calls. The shape is versioned in the public surface; breaking changes ride the same semver contract as the rest of the core.
- **A core-level "logs sink" abstraction** — `ILogsSink` — with two implementations: the `logs` plugin (preferred) and a built-in console writer (fallback). The core **always** picks a sink at boot. Plugins never see the absence of a sink; the core emits a warning at boot if the sink is the console fallback and the load set is production-like.
- **A `withIncidentLogging` adapter for `toolError(...)` paths** — pure wrapper that runs the inner tool handler, captures any structured result, and emits the matching incident on error. Applied at the tool-registration layer (one line per tool), it is **opt-out** via a single `disableIncidentLogging: true` flag in the registration. The 41 existing plugins opt in by default; a future "no-noise" plugin can opt out.

The "opt-out" framing is the key design decision. The default should be "log everything that fails"; the operator can silence a noisy plugin with one line, but the "I forgot to log" failure mode (today) is gone.

## Non-goals

- It does **not** add a UI / dashboard. The tools are MCP tools, consumed by agents.
- It does **not** introduce a *new* severity taxonomy or change the existing one. The f00153 7-level syslog taxonomy is the only one.
- It does **not** retroactively log events that already happened. The two new layers start emitting on the next boot; the existing JSONL history is unaffected.
- It does **not** migrate every plugin to use `ctx.logs.log()` for **informational** messages (info, notice). It only guarantees that every **error path** surfaces an incident. Plugin authors can still emit info-level messages explicitly.
- It does **not** break the "logs plugin is optional" invariant. When the load set excludes the `logs` plugin, the core's built-in console sink is the writer — the plugin surface is unchanged.

## Slices

- global_gate: validate

### S1 — Re-export `IPluginLogsHelper` / `IPluginLogInput` / `LogSeverity` from `@mcp-vertex/core/public`

- **Status**: done
- **Files**: `packages/core/src/public/index.ts` (re-export from `plugin-contract.ts`), `packages/core/tests/src/public/public-api.spec.ts` (assertion that the three types are in the public barrel), `packages/core/src/lib/plugins/plugin-contract.ts` (no signature change — only the re-export is new), `plugins/logs/README.md` (note that the types are now importable from core).
- **Gate**: type
- **Acceptance**:
  - `import type { IPluginLogsHelper, IPluginLogInput, LogSeverity, IncidentType } from '@mcp-vertex/core/public';` compiles cleanly against HEAD.
  - A spec asserts the four names are listed in the public barrel (the public-API spec pattern that catches accidental private-type leakage).
  - README of `@mcp-vertex/logs` adds a one-line cross-reference to the core barrel.
  - No source change in `plugin-contract.ts`.

### S2 — `ILogsSink` + core-level tool-call lifecycle plumbing

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/logs-sink.ts` (new — `ILogsSink` interface with `record(event: ILogEvent)`, two impls: `LogsPluginSink` and `ConsoleLogsSink`), `packages/core/src/lib/plugins/assemble.ts` (resolve the sink at boot — if `logs` plugin is loaded use its store, otherwise `ConsoleLogsSink`; emit a one-time warning on the console fallback when `--strict-logs` is on), `packages/core/src/lib/plugins/plugin-contract.ts` (add `logsSink?: ILogsSink` to `IMcpPluginContext` so the core can publish a single shared instance; plugins that want to emit do so via the sink, not via the `ctx.logs` helper, which becomes a thin wrapper), `packages/core/src/lib/plugins/load-plugins.ts` (call `ctx.logsSink.record(...)` on `onToolStart` / `onToolCall` / `onToolCancel` paths that the core itself runs), `packages/core/tests/src/lib/plugins/logs-sink.spec.ts` (new).
- **Gate**: type + verify
- **Acceptance**:
  - `ILogsSink.record(event: ILogEvent): Promise<void>` is the single contract between the core and any writer.
  - `LogsPluginSink` is a small adapter over the `logs` plugin's `appendEvent` (set in `load-plugins.ts` after the `logs` plugin's `register` has run).
  - `ConsoleLogsSink` writes structured JSON lines to `stderr` with the `ts`, `kind`, `toolName`, `outcome`, `severity`, `incidentType`, `summary`. The lines are redacted the same way the JSONL streams are.
  - `IMcpPluginContext.logsSink` is optional. When the core passes a `logs` plugin, it points the sink at that plugin. When not, the sink is `undefined` — but the core's own hooks use the sink they own (not the plugin's).
  - Spec: a synthetic boot with NO `logs` plugin loads, runs a tool call, and the console sink writes one line per lifecycle event. A boot WITH the `logs` plugin loads writes to the JSONL stream (verified by re-reading the file).
  - The existing `f00153` `ctx.logs.log` helper still works; it now internally calls `ctx.logsSink.record(...)` if present, else falls back to console (preserving S4 behaviour).

### S3 — `withIncidentLogging` adapter + opt-in for the 41 plugins

- **Status**: done
- **Files**: `packages/core/src/lib/tools/with-incident-logging.ts` (new — pure wrapper: `(handler, ctx) => wrappedHandler` that runs the inner handler, inspects the result for `isError: true`, and emits an incident with `incidentType: 'tool-failure'` by default; caller can override per-tool), `packages/core/src/lib/plugins/plugin-contract.ts` (extend `IToolRegistration` with optional `incidentType?: string` and `incidentLoggingDisabled?: boolean`), `packages/core/src/public/index.ts` (export the wrapper as `withIncidentLogging`), `plugins/quality/src/lib/tools/tools.ts` (wrap every `toolError` return with the adapter, opt-out only on `quality_redact_test`), `plugins/audit/src/lib/tools/plan-tool.ts` (same), `plugins/security/src/lib/tools/security-secrets.tool.ts` (same), `plugins/proposals/src/lib/tools/authoring.tool.ts` (same — already has many `toolError` paths), `plugins/notification/src/lib/tools/notification-await-lock.tool.ts` (same), `plugins/deps/src/lib/tools/deps-audit.tool.ts` (same). Each gets a tiny `incidentType: 'quality-failure'` / `'audit-failure'` / etc. label so `logs_incidents` distinguishes the source plugin.
- **Gate**: type + verify
- **Acceptance**:
  - The wrapper is a single function call wrapping the inner handler; no behaviour change for the success path.
  - The wrapper emits **one** incident per failed call, with `severity: 'error'`, `incidentType: <plugin-specific>`, `message: <result.error or summary>`, `files: <args.path>`, `agent: <args.agent>`, `context: { toolName, args }`. It does **not** swallow the result — the caller still receives the `toolError` payload so the MCP response is unchanged.
  - For the 5 plugins touched above, an end-to-end spec asserts that calling the tool with a payload that triggers a `toolError` produces **both** the existing structured error response AND a new entry in the curated error stream with the right `incidentType`.
  - `incidentLoggingDisabled: true` on a registration suppresses the emit (escape hatch for tests, for redaction-test-style tools that intentionally report failures as part of their contract).
  - Existing 41 plugins keep working; the change is purely additive.

### S4 — Auto-load the `logs` plugin when the host passes `--strict-logs`; document for plugin authors

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/load-plugins.ts` (when `--strict-logs` is on the CLI args and `logs` is **not** in the explicit plugin list, inject the `logs` plugin into the load set and log a one-time info line on stderr), `packages/core/src/lib/plugins/plugin-defaults.ts` (add the `logs` plugin to the defaults for the `quality` and `security` preset packs, since they benefit most from the incident surface), `docs/mcp-vertex/plugins/logs/AUTHORING.md` (new — short guide for plugin authors: how to type a `ctx.logs.log(...)` call, how to use the `incidentType` per plugin, when to opt out), `plugins/logs/src/lib/knowledge/logs-knowledge.ts` (add a "third-party plugin authoring" section that points to the new doc).
- **Gate**: type + docs
- **Acceptance**:
  - `--strict-logs` is parsed in `parse-cli-args`; the new boolean lives in `IMcpVertexCliArgs` next to `--agent-worktree`.
  - A boot with `--strict-logs` and `--plugins=audit,quality,security` ends up loading the `logs` plugin automatically and the JSONL streams are populated as if the user had passed `--plugins=audit,quality,security,logs`.
  - A boot without `--strict-logs` and without the `logs` plugin emits the console-sink lines (no JSONL).
  - `docs/mcp-vertex/plugins/logs/AUTHORING.md` is a 60-line file that walks through the public type imports and the `withIncidentLogging` adapter, with one code sample per use case.
  - `logs-knowledge.ts` cross-references the doc.

## Acceptance

- `bun run validate` → exit 0; new `verify:plugin-wiring:advisory` matrix includes the `withIncidentLogging` wrapper as a contract assertion (every wrapped tool has at least one spec that calls it with a payload that triggers `toolError` and asserts a matching `logs_query { incidentType: '<plugin>-failure' }` result).
- A third-party project that depends on `@mcp-vertex/core` and runs `bun run mcp-vertex --plugins=my-plugin` with `--strict-logs` ends up with a populated `.cache/mcp-vertex/results/logs/*.jsonl` without `my-plugin` calling a single logging API.
- The same project, without `--strict-logs`, gets structured JSON lines on stderr for every tool lifecycle event.
- A call to `logs_incidents` on a fresh boot that triggers 3 `quality-failure` events from 2 different `quality_complexity` calls (the most-likely failing path) returns 1 cluster with `count: 3, distinctAgents: 2, incidentType: 'quality-failure'`.

## Notes

### Migration cost

S1 is one line in `public/index.ts` plus a spec. S2 is the heaviest slice at ~300 lines (logs-sink module + load-plugins wiring + the two impls + spec). S3 is ~150 lines for the adapter + ~50 lines per touched plugin (5 of them). S4 is ~100 lines for the CLI wiring + the docs. Estimated total: ~700 lines of prod code + ~400 lines of tests.

### Why this is not overkill

The user asked for the obvious thing: every project, every plugin, every tool, every error — in the log. The non-obvious part is that the *core* is the one place this can be done once and for everyone. S1+S2+S3+S4 together are the smallest change that buys "without programming".

### Prior art

- **OpenTelemetry auto-instrumentation** — opt-in per-package, but the user does not opt in. We make the equivalent default-on, with opt-out for the few cases that need it.
- **Sentry SDK defaults** — capture every uncaught exception, every slow request. We mirror the philosophy: default-on, opt-out, with a strict-mode flag for the paranoid.
- **Bun's `Bun.serve({ error })` global handler** — single place, catches everything. Our `ILogsSink` is the same shape.
- **Datadog trace auto-instrumentation** — same idea at the language runtime level.
