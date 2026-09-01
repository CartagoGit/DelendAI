# AGENT.md — plugin `plugins/external-mcps`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Compose third-party MCP servers through the catalog + human ack.

## Public API

_(none)_

## Depends on

- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/external-mcps/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/external-mcps/tests/src/lib/detect-rules.spec.ts
- plugins/external-mcps/tests/src/lib/catalog.spec.ts
- plugins/external-mcps/tests/src/lib/discover-gate.spec.ts
- plugins/external-mcps/tests/src/lib/activation-policy.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

