# AGENT.md — plugin `plugins/test-convention`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Test-file convention enforcement (spec path, mock style, forbidden patterns).

## Public API

- DEFAULT_CONVENTION
- effectiveMockStyle
- mergeConvention
- suggestSpecPath
- scanDrift
- detectRunner
- renderCoverageMarkdown
- renderOverviewMarkdown
- renderRunnersMarkdown
- default

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/test-convention/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/test-convention/tests/src/lib/convention.spec.ts
- plugins/test-convention/tests/src/lib/knowledge.spec.ts
- plugins/test-convention/tests/src/lib/options-validation.spec.ts
- plugins/test-convention/tests/src/lib/runners.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

