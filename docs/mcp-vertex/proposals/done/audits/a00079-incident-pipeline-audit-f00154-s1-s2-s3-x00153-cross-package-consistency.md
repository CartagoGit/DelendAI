---
id: a00079
kind: audit
title: "incident pipeline audit — f00154 S1+S2+S3 + x00153 cross-package consistency"
status: done
type: proposal
track: packages/core+plugins/logs+plugins/quality
date: 2026-07-27
date_iso: 2026-07-27
mode: scoped-incident-pipeline
projects:
    - "@mcp-vertex/core"
    - "@mcp-vertex/logs"
    - "@mcp-vertex/quality"
related:
    - a00077  # prior plugins-folder audit (today's session)
    - f00154  # universal incident coverage (S1+S2+S3 just shipped)
    - x00153  # fix-proposal (S2/S3/S9 just shipped)
    - f00153  # incident-driven logs plugin (parent of f00154)
---

# a00078 — incident pipeline audit (2026-07-27)

## goal

User invoked `/audit` after f00154 S1+S2+S3 (incident-driven logs pipeline)
landed on top of f00153 (incident-driven logs plugin). This audit reads the
**incident surface** in `packages/core/src/lib/plugins/logs-sink.ts`,
`packages/core/src/lib/tools/with-incident-logging.ts`, and the consumers in
`plugins/quality/src/lib/tools/tools.ts`, looking for cross-package
consistency, duplication, and silent data loss.

It produces **package-scoped findings** that can become f00154 follow-ups
(or a new fix proposal), avoids cross-plugin scope, and writes to the
canonical `done/audits/` location with `status: done`.

## why

f00154 S1+S2+S3 was the biggest surface change in this session: a new
`ILogsSink` contract, two implementations (`LogsPluginSink`,
`ConsoleLogsSink`), a `sinkEventFromInput` adapter, and a
`withIncidentLogging` wrapper for plugin tool handlers. The change
touches:

- `@mcp-vertex/core` — the public `ILogsSink` / `ISinkEvent` exports,
  the `logsSink` field on `IMcpPluginContext`, and the
  `assembleCliConfig` fallback to `ConsoleLogsSink`.
- `@mcp-vertex/logs` — the `LogsPluginSink` adapter (delegates to
  `appendEvent`) and the `severityToOutcome` mapper that drives
  which stream the event lands in.
- `@mcp-vertex/quality` — first adopter of `withIncidentLogging`
  (the `quality_run` handler wraps its `runQuality` body).

The risk is duplication and drift: same `severityToOutcome` in two
packages, same `extractFiles` heuristic in two packages, same
`ILogsSink` interface declared in two files. Plus silent data loss
paths (`extractFiles` missing the `paths` key, `redactValue` crashing
on cycles, `process.stderr.write` not handling broken pipes).

## non-goals

- No plugin migrations beyond `quality` (f00154 already deferred
  per-plugin adoption).
- No rewrite of `f00153` or `f00154`.
- No renames of public types.
- No `severityToOutcome` consolidation in this audit (filed as a
  separate P0 follow-up proposal).

## slices

### S1 — Promote P0 fix proposal (severityToOutcome duplicated)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00155-incident-pipeline-p0.md`
  (new — the follow-up fix proposal).

### S2 — Promote P0 fix proposal (extractFiles missing `paths` key)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00155-incident-pipeline-p0.md`
  (same proposal; one root, two slices).

### S3 — Promote P1 fix proposal (redactValue cycle DoS + ILogsSink duplicate)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00156-incident-pipeline-p1.md`
  (new — the P1 hardening proposal).

### S4 — Promote P2 fix proposal (process.stderr.write without EPIPE guard)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00157-incident-pipeline-p2.md`
  (new — the P2 polish proposal).

## acceptance

- `bun run validate` → exit 0; the audit doc itself is well-formed.
- `verify:plugin-wiring` matrix continues to include `logs` + `quality`
  with all 9 + 4 tools wired.
- No new code changes ship in this proposal — the audit is a finding
  document; the fixes go in S1–S4 follow-ups.

## Verified State

| Knob | Value |
|---|---|
| HEAD | `96942e83` (`develop`) |
| Tests | 6066 passed (798 files, 2 skipped) |
| Build | 45 packages built OK |
| Biome | 43 errors, 75 warnings, 91 infos |
| `bun run typecheck` | exit 0 |
| `bun run lint:proposals` | 303 files, 0 fatal errors |
| LOC audited | ~600 lines across `logs-sink.ts`, `with-incident-logging.ts`, `plugin-contract.ts`, `tools.ts`, `normalize-event.ts`, `quality/tools.ts` |
| New code touched | f00154 S1+S2+S3 (~660 LOC across 4 new files + 8 edits) |
| Consumers wired | 1 (`plugins/quality/src/lib/tools/tools.ts`) |

## Findings

### 1. `severityToOutcome` is duplicated across `@mcp-vertex/core` and `@mcp-vertex/logs` (P0)

The same 16-line function exists in two files with the **exact same
logic**:

- `packages/core/src/lib/plugins/logs-sink.ts:204-220`
- `plugins/logs/src/lib/tools/tools.ts:619-635`

Both define:

```ts
const severityToOutcome = (
        severity: <union of 8 levels>,
): <union of 7 outcomes> => {
        if (severity === 'error' || severity === 'critical' ||
                severity === 'alert' || severity === 'emergency') return 'failed';
        if (severity === 'warning') return 'unknown';
        if (severity === 'notice') return 'cancelled';
        return 'ok';
};
```

`grep -nE 'severityToOutcome\s*\('` returns **2 hits** in production
code. The two implementations:

- Have **no shared import** — `plugins/logs/src/lib/tools/tools.ts`
  uses its own local copy.
- Cannot diverge silently today, but a future change to one (e.g.
  promoting `notice → failed` or mapping `debug → idle`) WILL diverge
  from the other because there is no compiler link.

The fix is to **export `severityToOutcome` from `@mcp-vertex/core/public`**
and have the `logs` plugin import it. The core owns the contract;
the plugin owns the persistence. The semantics must match.

This is the same anti-pattern documented in x00153 S6
(`PEER_REVIEW_LOG_RELATIVE_PATH` was duplicated until centralised).

### 2. `extractFiles` in `with-incident-logging.ts` is missing the `paths` key (P0)

`packages/core/src/lib/tools/with-incident-logging.ts:106-119` only
extracts `files`, `path`, `file`, `filePath`. It misses `paths`.

The matching helper in `plugins/logs/src/lib/services/normalize-event.ts:105`
(`extractFilesHint`) extracts all five: `files`, `paths`, `path`, `file`,
`filePath`. The `logs` plugin itself already uses `paths` in two tools
(`plugins/audit/src/index.ts:245` — `audit_run` — and
`plugins/conventions/src/lib/tools/classify-paths.tool.ts:73`).

**Impact**: when `audit_run` or `classify_paths` fail and the
`withIncidentLogging` wrapper emits an incident, the `files` field on
the emitted event is `[]` — losing the exact files the operator needs
to investigate. The `logs` plugin's own lifecycle hooks (which use
`extractFilesHint`) would correctly capture them; only the
incident-pipeline wrapper drops them.

The fix is to **import `extractFilesHint` from `@mcp-vertex/logs`** or
mirror its 5-key logic locally.

### 3. `redactValue` in `logs-sink.ts` has no cycle protection (P1)

`packages/core/src/lib/plugins/logs-sink.ts:218-231` walks any object
recursively with no `WeakSet` of seen objects. A plugin that emits
`meta = { self: meta }` (intentional or accidental) crashes the sink
with `RangeError: Maximum call stack size exceeded`.

This is a low-probability DoS but the **fix is one `WeakSet` argument**,
which makes it a no-cost hardening. `Object.fromEntries(...)` does
not protect against cycles either.

### 4. `ILogsSink` / `ISinkEvent` declared twice (P1)

The same interface is declared verbatim in:

- `packages/core/src/lib/plugins/logs-sink.ts:55-83` (the canonical one,
  with the 8-level severity union and the 7-outcome union).
- `packages/core/src/lib/plugins/plugin-contract.ts:147-159` (a
  structurally identical copy, re-exported to satisfy
  `IMcpPluginContext.logsSink`).

The `logs-sink.ts` version uses a method declaration (`record(event:
ISinkEvent): Promise<void>`); the `plugin-contract.ts` version uses
an arrow property (`readonly record: (event: ISinkEvent) => Promise<void>`).
They are assignable but the canonical declaration site is ambiguous.
The fix is to **export from `logs-sink.ts` and `import type` in
`plugin-contract.ts`**.

### 5. `process.stderr.write` in three sites without EPIPE guard (P2)

- `logs-sink.ts:162` — `ConsoleLogsSink.record`
- `with-incident-logging.ts:162` — sink-error fallback
- `with-incident-logging.ts:206` — `emitIncident` error fallback

`process.stderr.write` returns a boolean (or `undefined`) and emits
`'error'` when the pipe is broken (e.g. parent process gone, output
redirected to `/dev/full`, or a test that closes the stream). The
current code ignores both. On a CI box with broken stderr, the sink
**throws asynchronously** (Node surfaces `'error'` events on the
stream) — and the comment in `logs-sink.ts` says "MUST NOT throw",
so this is a documented invariant violation.

The fix is a small helper `writeStderr(line: string): void` that
catches the `'error'` event once and falls back to `console.error` in
the test mode. Two-line change per call site.

### 6. `withIncidentLogging` only wired in `plugins/quality` (P2)

Of the 41 plugins, only `plugins/quality/src/lib/tools/tools.ts`
actually wraps a tool handler. f00154 S3 documented this as
"intentional, opt-in", but the audit caller has no easy way to find
**which** tools are wrapped. A small registry annotation
(`IPluginRegistration.wrapsHandlers?: string[]`) would let the
quality plugin lint "every tool should have a wrapper" and report
exactly the ones missing it.

This is a follow-up, not a fix in this audit. Tracking as P2.

## Scoreboard

| Band | Count |
|---|---|
| P0 (fix in next slice) | 2 |
| P1 (harden in f00156) | 2 |
| P2 (polish in f00157) | 2 |
| **Total actionable** | **6** |

| Dimension | Score (0–10) |
|---|---|
| Correctness | 6 |
| Idempotency | 9 |
| Cross-package consistency | 4 |
| Observability | 7 |
| Test coverage | 7 |
| Documentation | 8 |
| Atomic durability | 9 |
| Output schema discipline | 9 |
| Plugin-author ergonomics | 6 |

**Weighted aggregate**: 7.0 / 10 (down from 8.4 in a00077 — f00154
added new code paths faster than the consistency discipline caught up).

## notes

- a00077 covered plugins/*; this audit covers the incident pipeline
  that landed AS A RESULT of f00154. They are intentionally
  complementary.
- f00154 S3 deferred per-plugin migration — this audit does **not**
  push for migration; it documents the latent bugs that exist
  independent of who adopts the wrapper.
- The `extractFilesHint` / `extractFiles` divergence is the single
  most impactful finding: the symptom is silent data loss in the
  incident stream that an operator investigating an outage would
  NOT have.
- The `severityToOutcome` duplication mirrors the `PEER_REVIEW_LOG_RELATIVE_PATH`
  duplication x00153 S6 fixed — same shape of anti-pattern,
  different package boundary.