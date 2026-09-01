# AGENT.md — plugin `plugins/remote-provider-core`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Shared remote-provider foundation: validated config, injectable HTTP, normalized errors.

## Public API

_(none)_

## Depends on

- @mcp-vertex/contracts
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/remote-provider-core/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/remote-provider-core/tests/diagnostics-e2e.spec.ts
- plugins/remote-provider-core/tests/http-client.spec.ts
- plugins/remote-provider-core/tests/mutations.spec.ts
- plugins/remote-provider-core/tests/diagnostics.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

