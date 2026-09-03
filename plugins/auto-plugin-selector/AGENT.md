# AGENT.md — plugin `plugins/auto-plugin-selector`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Recommends the best plugin set for this project from its signals (manifest, files, git, task).

## Public API

- default
- recommendPlugins
- buildConfigDiff
- buildLlmRationale

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/auto-agent-selector
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/auto-plugin-selector/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/auto-plugin-selector/src/index.spec.ts
- plugins/auto-plugin-selector/src/lib/apply/config-diff.spec.ts
- plugins/auto-plugin-selector/src/lib/catalog/first-party-candidates.spec.ts
- plugins/auto-plugin-selector/src/lib/refine/llm-rationale.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

