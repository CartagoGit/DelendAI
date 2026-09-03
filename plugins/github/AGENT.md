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
- plugins/github/tests/src/lib/client.spec.ts
- plugins/github/tests/src/lib/plugin-options.spec.ts
- plugins/github/tests/src/lib/security.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

