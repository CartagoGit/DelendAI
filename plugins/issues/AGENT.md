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

- plugins/issues/src/lib/services/error-sink-adapter.spec.ts
- plugins/issues/tests/index.spec.ts
- plugins/issues/tests/src/lib/frontmatter.spec.ts
- plugins/issues/tests/src/lib/github-client-security-dependabot-code-scanning.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

