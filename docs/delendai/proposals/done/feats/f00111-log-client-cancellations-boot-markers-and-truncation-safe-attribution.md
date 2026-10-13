---
id: f00111
title: "Log client cancellations, boot markers and truncation-safe attribution"
kind: feat
status: done
type: proposal
track: general
date: 2026-07-12
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 1 commits referencing f00111 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 1-commit batch
shipped-in:
  - a8145721 # feat(core,logs): log client cancellations, boot markers and truncation-safe attr
---

# f00111 — Log client cancellations, boot markers and truncation-safe attribution

## Goal

Make the JSONL operational log able to tell the "it got canceled / it looks
stuck" story: observe the SDK request `AbortSignal` in the instrumented tool
wrapper and fire a new `onToolCancel` host hook, persist it from the logs
plugin as the existing (never-emitted) `tool-cancelled` kind with elapsed ms,
emit a `server-started` marker per boot, and make line truncation preserve
`toolName`/`taskId`.

## why

Debugging the porra host "Canceled: Canceled" report showed three
observability holes in one session log:

- Client-side cancellations are invisible server-side — the wrapper never
  observes the SDK `AbortSignal`, so a canceled turn leaves no trace and is
  indistinguishable from a hang.
- Server (re)boots leave no marker in the JSONL, so sessions from a stale
  host process cannot be told apart from the live one (a recurring failure
  mode in shared workspaces).
- `serializeRedactedEvent` truncation replaces the whole `meta`, so tools
  with big results (`agent_catalog`, `get_proposal_workflow`) lose
  `meta.toolName` and look like unmatched started/completed pairs — today's
  "10 hangs" were exactly this artefact.

## non-goals

- Progress notifications for long-running tools (separate feature).
- Detecting cancellations that arrive after the response was sent (not
  observable server-side).
- Changing the log line-size cap or the redaction pipeline.

## Slices

- global_gate: e2e

### S1 — Core: onToolCancel hook wired from the instrumented wrapper AbortSignal
- **Status**: done
- **Files**: [packages/core/src/lib/project/create-mcp-project.ts, packages/core/src/lib/contracts/interfaces/host-config.interface.ts, packages/core/src/lib/plugins/plugin-contract.ts, packages/core/src/lib/cli/assemble.ts, packages/core/tests/src/lib/project/create-mcp-project.spec.ts]
- **Gate**: bun run validate
- status: done
### S2 — Logs plugin: tool-cancelled event, server-started boot marker, truncation keeps attribution
- **Status**: done
- **DependsOn**: S1
- **Files**: [plugins/logs/src/index.ts, plugins/logs/src/lib/services/normalize-event.ts, plugins/logs/tests/normalize-event.spec.ts]
- **Gate**: bun run validate
- status: done
- **Review hardening (2026-07-13)**: cancellation reporting is idempotent and also observes a signal already aborted before listener registration. Truncation now terminates when a caller supplies a cap smaller than the minimum attribution envelope, preserving `toolName` and `taskId` instead of looping forever.
## acceptance

- The instrumented wrapper finds the request `AbortSignal` among the handler
  args, fires `onToolCancel(toolName, args, elapsedMs)` exactly once on
  abort, and removes the listener when the handler settles.
- Hook args passed to `onToolStart`/`onToolCall`/`onToolCancel` are the
  parsed tool arguments — never the SDK `RequestHandlerExtra` (no more
  `{"signal":{},"_meta":…}` noise for schema-less tools).
- The logs plugin persists `tool-cancelled` with elapsed ms, appends one
  `server-started` event per boot (pid + workspace), and truncated lines
  keep `meta.toolName`/`meta.taskId`.
- `bun run validate` green.
