# AGENT.md — plugin `plugins/docs`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Doc generation, search, and rendered catalog.

## Public API

- default
- listDocs
- readDoc
- searchDocs
- extractTitle
- DEFAULT_DOC_ROOTS
- buildDocsToolRegistrations

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/docs/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/docs/tests/src/lib/docs-generate.tool.spec.ts
- plugins/docs/tests/src/lib/docs-pagination.spec.ts
- plugins/docs/tests/src/lib/docs.spec.ts
- plugins/docs/tests/src/lib/engine-search.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

