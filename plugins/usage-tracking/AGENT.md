# AGENT.md — plugin `plugins/usage-tracking`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Per-token/per-call usage tracking (spend, budget).

## Public API

- default
- detectAgent
- BUILTIN_CLIENT_TABLE
- RecordBuffer
- StartClock
- analyzeSessionHygiene
- DEFAULT_SESSION_HYGIENE_POLICY
- SessionHygieneMonitor
- mapHygieneToCheckpointAdvisory
- SESSION_TOO_LONG_CODE
- SessionTooLongAdvisorySource
- sessionTooLongDedupeKey
- readHostLifecycleEvents
- summarizeHostLifecycle

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/usage-tracking/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts
- plugins/usage-tracking/tests/session-surface-bytes.spec.ts
- plugins/usage-tracking/tests/src/invocation-telemetry.spec.ts
- plugins/usage-tracking/tests/src/lib/attribute.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

