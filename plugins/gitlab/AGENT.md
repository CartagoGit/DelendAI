# AGENT.md — plugin `plugins/gitlab`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- GitLab read-only provider context, HTTP client and resource tools.

## Public API

_(none)_

## Depends on

- @delendai/contracts
- @delendai/remote-provider-core
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/gitlab/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/gitlab/tests/diagnostics.spec.ts
- plugins/gitlab/tests/src/lib/client.spec.ts
- plugins/gitlab/tests/src/lib/mutations.spec.ts
- plugins/gitlab/tests/src/lib/plugin-options.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

