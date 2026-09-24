# AGENT.md — plugin `plugins/usage-tracking`

> Below the `<!-- delendai:begin agent-md -->
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
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/usage-tracking/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts
- plugins/usage-tracking/tests/session-surface-bytes.spec.ts
- plugins/usage-tracking/tests/src/invocation-telemetry.spec.ts
- plugins/usage-tracking/tests/src/lib/attribute.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

