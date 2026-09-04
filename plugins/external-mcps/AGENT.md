# AGENT.md — plugin `plugins/external-mcps`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Compose third-party MCP servers through the catalog + human ack.

## Public API

_(none)_

## Depends on

- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/external-mcps/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/external-mcps/src/lib/subprocess/env-filter.spec.ts
- plugins/external-mcps/tests/src/lib/activation-policy.spec.ts
- plugins/external-mcps/tests/src/lib/catalog.spec.ts
- plugins/external-mcps/tests/src/lib/configuration-metadata.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

