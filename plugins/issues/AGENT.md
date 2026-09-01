# AGENT.md — plugin `plugins/issues`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Issue tracker (GitHub) integration — list/fetch/analyze/ingest/resolve.

## Public API

- default

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/issues/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/issues/tests/index.spec.ts
- plugins/issues/tests/src/lib/github-client-security.spec.ts
- plugins/issues/tests/src/lib/github-setup.spec.ts
- plugins/issues/tests/src/lib/services/error-sink-adapter.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

