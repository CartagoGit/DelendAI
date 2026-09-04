# AGENT.md — plugin `plugins/docs`

> Below the `<!-- delendai:begin agent-md -->
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
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/docs/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/docs/tests/src/lib/docs-generate.tool.spec.ts
- plugins/docs/tests/src/lib/docs-pagination.spec.ts
- plugins/docs/tests/src/lib/docs.spec.ts
- plugins/docs/tests/src/lib/engine-search.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

