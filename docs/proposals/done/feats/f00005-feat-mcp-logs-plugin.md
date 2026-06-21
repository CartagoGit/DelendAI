---
id: f00005
kind: feat
title: MCP logs plugin — persistent append-only event log + correlation + observability dashboard
status: done
date: 2026-06-20
track: plugins+notification+memory+web+docs
budget: { maxInputTokens: 80000, maxOutputTokens: 40000, maxIterations: 100 } # per slice-claim
triaged: true
unblocked_by:
  - f00016:S8 # agent-alive / agent-idle / agent-dead via withFileMutex mtime
  - f00016:S9 # 5 recovery tools (proposal_stale_list, agent_lock_release_orphan, …)
  - f00016:S10 # /status/recovery dashboard with SSE
ownership:
  - { agent: implementation_runner, task: "S1: plugins/logs skeleton + redactSecrets + append-only writer + daily rotation + GC at boot" }
  - { agent: implementation_runner, task: "S2: tool-registry hook for started/completed/failed/timed_out capture" }
  - { agent: implementation_runner, task: "S3: subscribe to notifications/message bus + normalize events + correlate claim→started→completed chain" }
  - { agent: implementation_runner, task: "S4: 5 tools (logs_query, logs_tail, logs_subscribe, logs_correlate, logs_redact_test) + specs" }
  - { agent: implementation_runner, task: "S5: apps/web/src/pages/status/logs.astro + SSE endpoint + 12-language i18n (mirrors f00016 S10)" }
  - { agent: implementation_runner, task: "S6: acceptance — bun run validate green" }
reservedFiles:
  - plugins/logs/
  - plugins/logs/src/
  - plugins/logs/tests/
  - plugins/logs/package.json
  - plugins/logs/README.md
  - .cache/mcp-vertex/logs/
  - apps/web/src/pages/status/logs.astro
  - apps/web/src/components/logs/
  - apps/web/src/pages/api/events/logs.ts
  - apps/web/src/i18n/langs/
  - docs/LOGS.md
acceptance:
  - { command: bun run type, expect: exit0 }
  - { command: bun run test, expect: exit0 }
  - { command: bun run lint, expect: exit0 }
  - { command: bun run site:strict, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
author:
  nickname: Cartago
  github: cartago-relaxingcup
  npm: cartago-relaxingcup
  email: cartago.relaxingcup@gmail.com
  linkedin: null
related:
  - f00016 # state machine + agent events the log subscribes to
  - f00014 # IDE extension — complementary consumer of the same logs
  - p111 # post-closure audit — historical source of "why did this stop?" pain
---

# f00015 — MCP logs plugin

## Goal

Ship a **`plugins/logs`** package that captures every observable event
in the MCP server (tool invocations, agent lifecycle, lock state
changes, quality runs, recovery actions) into a **persistent,
append-only, secret-redacted JSONL log**, exposes 5 tools to query and
correlate the log, and renders an **`/status/logs` dashboard** that
answers the question *"why did this stop?"* — the question that today
has no answer because tool cancellations, timeouts, agent crashes and
user-driven chat cancellations all leave no trace in the system.

The log is the single source of truth for post-mortem analysis,
replacing the current "ask the agent what happened" / "grep
`.cache/`" workflow with a structured, queryable, timeline-aware view.

## Why

Three concrete pains today, confirmed across multiple sessions:

1. **Cancellations are invisible.** When the user cancels a chat
   response (UI of VS Code Copilot), or when a long-running tool is
   killed, or when an agent's heartbeat stops, the server-side state
   shows the symptom (lock held, file half-written, slice in
   `in-progress/`) but the *cause* is unrecoverable. There is no
   "last events before this happened" view — the closest thing is
   `state_health`, which only sees the *current* state, not how we got
   here.
2. **No correlation across plugins.** `quality_cancel` knows it killed a
   PID. `notification` knows a lock was released. `proposals` knows a
   slice was submitted. None of them join these into a single
   per-task timeline. An operator investigating a stuck slice has to
   reconstruct it from 3-4 separate tools, in order, by hand.
3. **Recovery is blind to its own history.** `f00016` S9 introduces
   `proposal_stale_list` and `proposal_diagnose` — but they only see
   the *current* state, not "this is the 4th time this slice has gone
   zombie in the last week". Without history, the same root cause can
   recur indefinitely without anyone noticing the pattern.

This proposal fixes all three by adding a write-once, read-many
append-only log that every existing plugin can publish to, and a thin
plugin that owns the persistence, redaction, rotation and querying.

## Why this design

### Why a new plugin, not a feature of `notification` or `memory`

`notification` is the *event bus* — it routes events to subscribers in
real time but does not persist them (no replay, no historical query).
`memory` persists durable state but its schema is per-note (text +
tags), not per-event (typed records with causal chain). The log needs
both: real-time delivery (subscribers) and durable replay (query).
Neither neighbour fits; a new plugin avoids forcing either to grow a
schema they were not designed for, and keeps the `plugins/logs`
namespace small enough to delete or replace without rippling.

### Why append-only JSONL, not a SQLite database or a sidecar

The repo's existing primitive — `withFileMutex` + `writeFileAtomic` +
`redactSecrets` — is proven on `agents.lock.json`, proposal counters,
memory store. An append-only JSONL file per day is the same pattern,
no new dependency, no schema migration: every line is a self-contained
record. SQLite would add a native module, complicate the
`writeFileAtomic` discipline (WAL checkpoints, fsync), and break the
invariant that every persistent artefact is a plain text file
inspectable with `cat` / `jq`. The volume (one event per MCP
invocation + one per agent-heartbeat tick) stays under 10 MB/day on
realistic workloads — well within the rotation budget.

### Why subscribe to `notifications/message`, not poll mtime

`f00016` S8 introduces `agent-events.ts` watching the
`withFileMutex` heartbeat mtime and re-emitting events through the
notification bus. `f00015` subscribes to that bus, not to the mtime
directly — so:

- `notification` and `logs` are not double-watching the same source.
- `f00016` can change internal mtime heuristics without breaking `f00015`.
- Any future event source (e.g. an editor-side cancel event, if VS
  Code ever exposes one) only has to publish to the bus to be logged.

### Why `/status/logs`, not `/admin/logs` or `/debug/events`

`/status/*` is the existing surface for operational state (`recovery`
lives there too — `f00016` S10). Logs are operational state, not admin
tools, not debug tooling. Same i18n rules, same SSE pattern, same
dashboard conventions. The cost of a new top-level page section is
non-trivial (i18n for 12 languages, navigation entry, recovery
dashboard discoverability) and not justified by this proposal alone.

### Why 5 tools, not 3 or 7

The minimum surface to answer "why did this stop?" is:

- **query** — find events matching filters (the basic ask)
- **correlate** — given a task or agent id, return the causal chain
  (this is the *answer* to "why")
- **tail** — show recent events (debugging "what just happened?")

Two more round out the surface:

- **subscribe** — SSE stream for live dashboards (mirrors `f00016` S10
  pattern; needed for the dashboard's live updates)
- **redact_test** — audit helper to prove `redactSecrets` is doing its
  job (canary payloads, regression coverage; not user-facing but
  cheap to expose and the only safe way to verify redaction without
  reading the raw log)

Six+ tools would mean overlap with `state_health`, `compact_status`,
`metrics` and `agent_lock status` — we explicitly do not duplicate
those, the log is *complementary*, not a replacement.

### Why per-day rotation, not per-hour or per-size

Per-day matches the granularity of post-mortem analysis ("what
happened yesterday?") and keeps GC simple (1 file deleted per day
older than 30). Per-hour would explode the file count under
sustained incident load. Per-size would couple rotation to write
patterns and complicate tail/grep workflows.

### Why 30-day retention, not 7 or 90

Enough for one monthly post-mortem cycle (28-31 days) plus a buffer.
7 days is too short to spot recurring patterns. 90 days crosses the
boundary where the log should be a proper telemetry system, not a
plugin — that is a separate proposal if ever needed.

## Non-goals

- **Not** capturing editor-side events (chat cancellation by user,
  IDE window close). No API exists in VS Code for these today, and
  inventing a side-channel is out of scope. The log answers "what
  happened in the server"; editor-side observability is its own
  problem.
- **Not** replacing `metrics`, `state_health`, `compact_status`. Those
  tools answer *current* state. The log answers *historical* state.
  They compose: `state_health` for "is anything wrong now", log for
  "what was the sequence that led to wrong".
- **Not** introducing structured query (SQL, jq filters built into
  the tool). The 5 tools cover the 90% case; structured query is a
  follow-up if real demand shows up.
- **Not** shipping a UI for log editing, replay, or injection. The
  log is write-only from the runtime's perspective; humans only read.
- **Not** implementing log shipping, centralization, or remote sinks.
  Out of scope; local append-only is the contract.
- **Not** changing the `redactSecrets` primitive. The plugin
  *consumes* it; widening its scope is its own concern.

## Architecture

### Sources (what gets logged)

| Source | Event kinds | When |
|---|---|---|
| Tool registry hook (S2) | `tool-started`, `tool-completed`, `tool-failed`, `tool-timed-out` | Every MCP tool invocation |
| `notification` bus (S3) | `agent-alive`, `agent-idle`, `agent-dead`, `lock-claimed`, `lock-released` | When `f00016` S8/S9 emit them |
| `quality` plugin | `quality-run-started`, `quality-run-finished`, `quality-run-cancelled` | When a quality scope starts/ends |
| `proposals` plugin | `slice-submitted`, `slice-approved`, `slice-request-changes`, `proposal-stale-detected` | When `f00016` S9 emits them |
| `state_health` | `state-repaired`, `state-inconsistency-detected` | Whenever the repair tool is invoked |

A single `normalizeEvent(kind, payload)` function (S1) maps every
source's payload into one of:

```typescript
type LogEvent = {
  ts: string;                // ISO-8601 UTC, monotonic per day-file
  kind: EventKind;           // one of the kinds above
  agent: string | null;      // owning agent if any
  taskId: string | null;     // proposal id or task id if any
  outcome: 'ok' | 'failed' | 'timed-out' | 'cancelled' | 'dead' | 'idle' | 'unknown';
  files: string[];           // files involved (for slice/quality events)
  summary: string;           // ≤ 200 chars, redacted, human-readable
  meta: Record<string, unknown>; // source-specific payload (redacted)
};
```

`outcome` is the field that lets `logs_correlate` produce a chain:
`claim (ok) → started (ok) → completed (ok) | failed | timed-out |
cancelled`.

### Persistence (S1)

```
.cache/mcp-vertex/logs/
├── 2026-06-20.jsonl          # append-only, one event per line
├── 2026-06-19.jsonl          # yesterday
├── ...
└── 2026-05-22.jsonl          # 30 days ago, eligible for GC
```

- **Write**: `withFileMutex(filePath, async () => appendFile(...))` —
  the same primitive every shared-state mutation in the repo already
  uses. One mutex per day-file (not per directory), so concurrent
  writers across days do not contend.
- **Rotate**: at boot, GC files older than 30 days. No runtime
  rotation; if a single day's file exceeds 100 MB, log a warning
  (visible via `logs_tail` filtering on `kind: log-warning`) and keep
  appending.
- **Redact**: every line passes through `redactSecrets` before write.
  Tested with canary payloads (AWS keys, GitHub PATs, JWTs) — see
  `logs_redact_test`.
- **Size cap per line**: 8 KB. Truncated events carry
  `__truncated__: true` in `meta` so a query can flag them.
- **Atomic**: `writeFileAtomic` for any non-append operation (e.g.
  compaction, if ever added — out of scope here).

### Tools (S4)

| Tool | Read/Write | Output schema key fields |
|---|---|---|
| `logs_query` | R | `events: LogEvent[]`, `cursor: string \| null`, `hasMore: boolean` |
| `logs_tail` | R | `events: LogEvent[]`, `oldestTs: string`, `newestTs: string` |
| `logs_subscribe` | R (SSE) | stream of `LogEvent` matching filter |
| `logs_correlate` | R | `chain: LogEvent[]`, `firstTs: string`, `lastTs: string`, `gaps: Gap[]` |
| `logs_redact_test` | R | `detected: string[]`, `redacted: string` |

All 5 return `outputSchema`-typed JSON. The plugin does **not** export
a write tool; the log is internal-only.

### Dashboard (S5)

`apps/web/src/pages/status/logs.astro` — sibling of the `recovery`
page from `f00016` S10. Same shell, same SSE pattern, same 12-language
i18n keys (`logs.*`). On render:

1. Calls `logs_tail({ limit: 50 })` for the initial paint.
2. Subscribes via SSE to `logs_subscribe` filtered on the
   user-selected `outcome` (default: all).
3. On each new event, prepends it to the table with colour-coded
   outcome badge (green = ok, amber = idle, red = failed / timed-out
   / cancelled / dead).

The dashboard is **read-only**. No buttons that mutate. The closest
interactive feature is a "copy task id" button on each row to feed
into `logs_correlate`.

### i18n (S5)

`logs.*` keys added to all 12 `apps/web/src/i18n/langs/*.ts`:

```typescript
logs: {
  page_title: string;
  filter_outcome: string;
  filter_agent: string;
  filter_task: string;
  outcomes: {
    ok: string; failed: string; timed_out: string;
    cancelled: string; dead: string; idle: string; unknown: string;
  };
  columns: {
    ts: string; kind: string; agent: string; task: string;
    outcome: string; summary: string;
  };
}
```

`bun run site:strict` (already in acceptance) fails if any key is
missing in any of the 12 languages.

### How it covers "why did this stop?"

Concrete scenario — the user-cancelled chat response from this very
session:

1. The user clicked Cancel on a chat response that was about to call
   `mcp-vertex_overview`.
2. **In the log**: `tool-started { kind: 'tool-started', tool:
   'mcp-vertex_overview', agent: null, taskId: null, ts: T0 }`.
3. The tool *did* run to completion server-side — there is no
   server-side signal of a client cancellation.
4. **What the log shows**: `tool-started { tool:
   'mcp-vertex_overview' }` followed *minutes later* by
   `tool-completed { tool: 'mcp-vertex_overview', outcome: 'ok' }`.
5. The user pressing Cancel affected only the *response rendering*,
   not the tool. There is no "cancellation" event because there was
   no cancellation to log.

This is the honest answer to "I want a log that shows me why it
stopped": the log will show that nothing stopped on the server side.
The UI cancel is invisible to the log because it never reached the
server. We say this explicitly in the proposal so future readers do
not expect the log to magically surface editor-side events.

For *server-side* stops (timeout, agent crash, quality cancel), the
log *does* have everything needed:

- `tool-started` with no matching `tool-completed` within the tool's
  declared timeout → `logs_tail --kind tool-started` reveals the
  orphan; `logs_correlate --taskId <slice-id>` shows the full chain.
- `agent-dead` without a matching `agent-alive` resumption → visible
  in the dashboard's red badge column.
- `quality-run-cancelled` → visible immediately in `logs_tail`.

## Slices

### S1 — Plugin skeleton + persistence + redaction + rotation *(excl. `plugins/logs/`, `.cache/mcp-vertex/logs/`)*

- **Status**: done
- Create `plugins/logs/` with `package.json` (no new runtime deps;
  reuses `withFileMutex`, `writeFileAtomic`, `redactSecrets` from
  `packages/core`), `tsconfig.json`, `vitest.config.ts`,
  `src/lib/`, `src/public/index.ts` (barrel), `tests/`.
- Create `plugins/logs/src/lib/log-store.ts` with `appendEvent(event)`,
  `readRange({ since, until })`, `tail({ limit })`, `gc({ olderThanDays })`.
- Create `plugins/logs/src/lib/normalize-event.ts` with the
  `LogEvent` type and `normalizeEvent(kind, payload)` mapper — source
  for S2/S3.
- Wire the plugin into `plugins/logs/src/lib/tools.ts` registration.
- Create `docs/LOGS.md` documenting the log schema, retention,
  rotation, GC, and the explicit non-coverage of editor-side events.
- `log-store.spec.ts`: append-then-read roundtrip, daily file
  rotation, GC deletes only files older than threshold, mutex
  contention across 25 concurrent appenders (no lost lines, no
  interleaved JSON), `redactSecrets` strips canary payloads
  (`AKIA...`, `ghp_...`, `eyJ...` JWTs), per-line size cap truncates
  with `__truncated__: true`.
- **Gate**: `bun run type && bun run test plugins/logs`.
- **Shipped**: `@mcp-vertex/logs` package, append-only JSONL store,
  mutexed writes, redaction-before-serialization, daily files, GC,
  truncation flag, docs and persistence tests.

### S2 — Tool-registry hook *(excl. `plugins/logs/src/lib/tool-hook.ts`)*

- **Status**: done
- Create `plugins/logs/src/lib/tool-hook.ts` exporting
  `installToolHook(registry)` that wraps every tool's
  `runTool` call with a try/finally that emits `tool-started` on
  entry and `tool-completed | tool-failed | tool-timed-out` on
  exit. Outcome detection: thrown `TimeoutError` →
  `timed-out`; thrown `Error` → `failed`; normal return →
  `ok`. Cancellation by `quality_cancel`-style cooperative abort
  → `cancelled` (caller signals via a `AbortSignal` argument
  the hook recognizes; existing tools not updated yet emit
  `unknown`).
- Wire the hook into the plugin's `activate()`.
- `tool-hook.spec.ts`: each outcome path (ok, failed, timed-out,
  cancelled, unknown), hook does not mutate the tool's return
  value, hook does not swallow exceptions, hook latency overhead
  ≤ 1 ms per invocation (microbenchmark).
- **Gate**: `bun run test plugins/logs`.
- **Shipped**: agnostic `onToolStart` core/plugin hook plus logs
  `onToolStart`/`onToolCall` capture for started/completed/failed
  tool events without introducing logs vocabulary into core.

### S3 — Subscribe to `notifications/message` + correlation *(excl. `plugins/logs/src/lib/correlate.ts`, `plugins/logs/src/lib/subscribe.ts`)*

- **Status**: done
- Create `plugins/logs/src/lib/subscribe.ts` exporting
  `subscribeToBus(bus, sink)` that listens for
  `agent-alive`, `agent-idle`, `agent-dead`, `lock-claimed`,
  `lock-released` and routes them through `normalizeEvent` →
  `appendEvent`. Coexists with `f00016` S8/S9's bridge without
  double-emission (single subscriber).
- Create `plugins/logs/src/lib/correlate.ts` with
  `correlate({ taskId, agent, since, until })` that reads the
  log range, groups by `taskId` (or `agent`), sorts by `ts`,
  identifies gaps (> 60 s with no event between claim and
  completion), returns the chain.
- `subscribe.spec.ts`: each event kind maps to the right
  `LogEvent` shape; redaction runs on every payload.
- `correlate.spec.ts`: full claim→started→completed chain;
  missing-middle (started without claim); orphan-started
  (started without completion within timeout); gap detection.
- **Gate**: `bun run test plugins/logs`.
- **Shipped**: generic event-bus subscriber, event normalization,
  redacted payload handling, correlation chain builder and gap
  detection tests.

### S4 — 5 tools + integration specs *(excl. `plugins/logs/src/lib/tools/`)*

- **Status**: done
- Create the 5 tool files (one per tool) under
  `plugins/logs/src/lib/tools/`, each registering the MCP tool
  via the plugin's existing pattern. Every tool declares an
  `outputSchema` (rule 8 of `AGENTS.md`).
- `logs_query` — accepts `since`, `until`, `kind`, `agent`,
  `taskId`, `outcome`, `limit` (default 100, max 1000),
  `cursor` (opaque, returned by previous call). Returns
  `{events, cursor, hasMore}`.
- `logs_tail` — accepts `limit` (default 50), `outcomeFilter`.
  Returns `{events, oldestTs, newestTs}`.
- `logs_subscribe` — accepts `outcomeFilter`, `kindFilter`,
  returns SSE handle (tool registration uses the same pattern
  `f00016` S10 introduces for `/api/events/[topic].ts`).
- `logs_correlate` — accepts `taskId` or `agent` (one required,
  not both), `since`, `until`. Returns `{chain, firstTs,
  lastTs, gaps}` where `gaps` is an array of
  `{startTs, endTs, durationMs}`.
- `logs_redact_test` — accepts `text: string`, returns
  `{detected: string[], redacted: string}`. The `detected`
  array lists the pattern names that matched (so a tester can
  assert "the email regex fired").
- `logs.spec.ts`: end-to-end with a real in-memory MCP server
  (per the `*.spec.ts` colocated + e2e convention from
  `AGENTS.md`); covers each tool's happy path and the documented
  failure modes (no events match, cursor exhaustion, correlation
  with no chain).
- **Gate**: `bun run test plugins/logs` + `bun run type`.
- **Shipped**: `logs_query`, `logs_tail`, `logs_subscribe`,
  `logs_correlate`, `logs_redact_test`, all with output schemas,
  generated SDK types and tool tests.

### S5 — `/status/logs` dashboard + SSE + 12-language i18n *(excl. `apps/web/src/pages/status/logs.astro`, `apps/web/src/components/logs/`, `apps/web/src/pages/api/events/logs.ts`, `apps/web/src/i18n/langs/`)*

- **Status**: done
- Create `apps/web/src/pages/status/logs.astro` mirroring
  `apps/web/src/pages/status/recovery.astro` (from `f00016` S10).
- Create `apps/web/src/components/logs/LogTable.astro` with
  one row per event, colour-coded outcome badge, "copy task id"
  button.
- Create `apps/web/src/components/logs/OutcomeBadge.astro` using
  the `logs.outcomes.*` i18n keys.
- Create `apps/web/src/pages/api/events/logs.ts` as an SSE
  endpoint streaming `logs_subscribe` output, rate-limited at
  100 events/sec per connection (burst-allow 200).
- Add `logs.*` keys to all 12 `apps/web/src/i18n/langs/*.ts`.
- Manual end-to-end test: start the dev server, generate a
  fake `tool-failed` event via the test harness from S4,
  confirm the row appears in the dashboard within 2 s.
- **Gate**: `bun run site:strict` (fails on any missing i18n
  key, per rule 9 of `AGENTS.md`).
- **Shipped**: `/status/logs`, `/api/events/logs`, log table,
  outcome badges, copy-task affordance, plugin/site capability
  generation and 12-language `logs.*` i18n coverage.

### S6 — Acceptance *(excl. `bun run validate`, `docs/proposals/blocked/f00015-feat-mcp-logs-plugin.md`)*

- **Status**: done
- Aggregator slice: runs the full monorepo gate end-to-end and confirms
  every line item in the proposal's top-level `acceptance:` frontmatter
  resolves to exit 0. Touches no production source files itself —
  its exclusive concern is this proposal document (lint:proposals must
  pass on `f00015` itself) and the orchestrator-level command that ties
  the gate together.
- The 5 commands already declared in the top-level `acceptance:`
  frontmatter are the slice's commands; this slice is the runbook for
  them, not a duplicate definition.
- **Gate**: `bun run validate` (umbrella for the 5 acceptance commands
  above; expected exit 0; equivalent to passing each individually).
- **Estimated work**: 0.25 session (a single `bun run validate` run
  plus fixing any incidental lint drift surfaced by the new files).
- **Shipped**: `bun run validate` and `bun run site:strict` green
  after the logs package, generated types and web dashboard landed.

## Dependency graph

```
S1 ──┬──► S2 ──┐
      │         │
      │         ├──► S4 ──┐
      │         │          │
      └──► S3 ──┘          ├──► S6
                           │
                (S5 waits for S4)
                           │
                           ▼
                          S5 ──► S6
```

Critical path: S1 → S3 → S4 → S5 → S6 (≈ 4.5 sessions).
Parallelisable: S2 (independent of S3, can run alongside).

External dependency on `f00016`: blocked on `f00016:S8`, `f00016:S9`,
`f00016:S10`. The `f00016` S5 reconciler will promote `f00015` from
`blocked/` to `ready/` automatically when those three slices
land (per the `blocked → ready` auto-resolution rule of the
state machine).

## Acceptance

- [x] `plugins/logs/` builds, lints, tests green.
- [x] 5 tools registered with `outputSchema` (rule 8 of `AGENTS.md`).
- [x] `.cache/mcp-vertex/logs/<date>.jsonl` appends one line per
      event, with `redactSecrets` applied, per-line size capped at
      8 KB, GC deletes files older than 30 days at boot.
- [x] `logs_correlate --taskId <X>` returns the full
      claim→started→completed chain with gap detection.
- [x] `/status/logs` dashboard renders, subscribes via SSE, shows
      outcome-coloured badges.
- [x] All 12 `apps/web/src/i18n/langs/*.ts` have full `logs.*` keys.
- [x] `docs/LOGS.md` documents schema, retention, rotation, GC,
      and the explicit non-coverage of editor-side events.
- [x] `bun run validate` (type + test + lint + site:strict +
      lint:proposals) green.
- [x] Manual smoke: every documented failure mode of every tool
      produces a structured error envelope (per the
      `mcp-vertex-failure-modes` skill convention), not an
      unhandled exception.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Log volume explodes during incident (quality timeout storms, recovery loops) | Per-line 8 KB cap + 100 MB/day file warn + daily rotation; `bun run validate` includes a fuzz test that asserts bounded growth |
| Persisting secrets via tool payloads (a tool returns an API key) | `redactSecrets` on every line before write; `logs_redact_test` exposes the detector list for audit; canary payloads in the spec cover AWS / GitHub / JWT / PEM private keys |
| `f00016` changes event names (e.g. renames `agent-dead` to `peer-down`) | S3 normalises at the boundary; a single mapping test (`event-normalization.spec.ts`) catches breaks; `f00015` does not depend on `f00016`'s internal naming |
| Double subscription with `notification` (both watching mtime) | `f00015` subscribes to the **bus** `notifications/message`, not the mtime — single source of events |
| Concurrent appenders corrupting the JSONL | `withFileMutex` per day-file (not per directory); 25-way concurrency spec already covered by the mutex primitive |
| Dashboard overwhelms the SSE bus during incidents | 100 events/sec per connection rate limit, burst 200; the dashboard batches via the `outcomeFilter` so a focused view is cheap |
| Plugin registration order breaks (logs tries to subscribe before notification publishes) | S1 wires the subscription in `activate()` after both plugins are loaded; spec asserts the subscription succeeds even when `notification` emits before logs is ready (buffered at the bus level, the existing `notification` queue semantics apply) |
| Editor-side cancel events never reach the log | Documented in `docs/LOGS.md` § "What this log does not cover"; not a bug, not mitigated, honest non-coverage |

## Notes

- This proposal **does not** modify `f00016`. It depends on `f00016`'s
  contract (events emitted to the bus), not its implementation.
- The 5 tools are read-only. A write tool would let any caller forge
  log entries and is rejected on principle.
- The log is **per-host**, not per-workspace. A single MCP server
  process owns its `.cache/mcp-vertex/logs/`. Multi-host aggregation
  is out of scope.
- Per-line size cap (8 KB) is generous: a `tool-failed` event with
  full stack trace and redacted args fits in ~2 KB. 8 KB catches
  pathological payloads (multi-MB tool outputs) without breaking
  the line-oriented format.
- `logs_redact_test` is a tiny audit helper, not a debug surface.
  It exists so CI can assert "if you swap `redactSecrets` for a
  weaker regex, the test fails" — a regression guard, not a
  feature.
