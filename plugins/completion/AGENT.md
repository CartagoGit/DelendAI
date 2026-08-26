# AGENT.md — plugin `plugins/completion`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.

## Public API

- default
- createCompletionStore
- recordFileName
- recordPath
- buildClearRegistration
- buildReportCompleteRegistration
- buildStatusRegistration

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/completion/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/completion/tests/src/lib/completion-store.spec.ts
- plugins/completion/tests/src/lib/completion-tools.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

