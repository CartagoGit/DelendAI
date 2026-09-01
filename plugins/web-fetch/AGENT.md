# AGENT.md — plugin `plugins/web-fetch`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Web fetch (allow-listed URLs only).

## Public API

- default
- webFetch
- isHostAllowed
- isHostPortAllowed
- buildWebToolRegistrations

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/web-fetch/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/web-fetch/tests/src/lib/services/engine.spec.ts
- plugins/web-fetch/tests/src/lib/engine.spec.ts
- plugins/web-fetch/tests/src/lib/plugin-options.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

