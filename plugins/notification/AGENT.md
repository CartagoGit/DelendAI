# AGENT.md — plugin `plugins/notification`

> Below the `<!-- mcp-vertex:begin agent-md -->
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

- <host workspace>/.mcp-vertex/cache/notification/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/notification/tests/src/lib/agent-events.spec.ts
- plugins/notification/tests/src/lib/notification.spec.ts
- plugins/notification/tests/src/lib/safe-logging.spec.ts
- plugins/notification/tests/src/lib/wait-diagnosis.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

