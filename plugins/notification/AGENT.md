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
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/notification/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/notification/tests/src/lib/notification.spec.ts
- plugins/notification/tests/src/lib/agent-events.spec.ts
- plugins/notification/tests/src/lib/safe-logging.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

