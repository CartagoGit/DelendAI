# AGENT.md — plugin `plugins/notification`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Notification + lock-await primitives.

## Public API

- default
- readInFlight
- diffReleased
- createReleaseWatcher
- buildNotifyRegistration
- watchAgentHeartbeat
- startAgentEventsBridge

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/notification/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/notification/tests/src/lib/agent-events.spec.ts
- plugins/notification/tests/src/lib/notification.spec.ts
- plugins/notification/tests/src/lib/safe-logging.spec.ts
- plugins/notification/tests/src/lib/wait-diagnosis.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

