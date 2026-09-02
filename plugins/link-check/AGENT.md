# AGENT.md — plugin `plugins/link-check`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Markdown link checker.

## Public API

- checkLinks
- extractLinks
- headingAnchors
- parseTarget
- slugify
- realLinkScanDeps

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/link-check/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/link-check/tests/src/lib/check-links.spec.ts
- plugins/link-check/tests/zz-journal-probe.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

