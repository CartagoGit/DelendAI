# AGENT.md — plugin `plugins/tech-debt`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Tech-debt scanner (TODO/FIXME/HACK inventory).

## Public API

- scanFile
- scanMarkers
- realTechDebtDeps

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/tech-debt/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/tech-debt/tests/src/lib/scan-markers.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

