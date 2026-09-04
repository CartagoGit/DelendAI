# AGENT.md — plugin `plugins/remote-provider-core`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Shared remote-provider foundation: validated config, injectable HTTP, normalized errors.

## Public API

_(none)_

## Depends on

- @delendai/contracts
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/remote-provider-core/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/remote-provider-core/tests/diagnostics-e2e.spec.ts
- plugins/remote-provider-core/tests/diagnostics.spec.ts
- plugins/remote-provider-core/tests/http-client.spec.ts
- plugins/remote-provider-core/tests/mutations.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

