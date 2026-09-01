# AGENT.md — plugin `plugins/github`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- GitHub read-only provider context, HTTP client and remote resource tools.

## Public API

_(none)_

## Depends on

- @mcp-vertex/contracts
- @mcp-vertex/remote-provider-core
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/github/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/github/tests/diagnostics.spec.ts
- plugins/github/tests/src/lib/write-tools.spec.ts
- plugins/github/tests/src/lib/tools.spec.ts
- plugins/github/tests/src/lib/client.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

