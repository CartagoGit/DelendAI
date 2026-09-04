# AGENT.md — plugin `plugins/refactor`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Refactor primitives (symbols, definition, references, rename, codemod).

## Public API

- buildNavEngine
- parseSourceFile
- buildRefactorNavToolRegistrations
- planRename
- buildRefactorRenameToolRegistrations

## Depends on

- @delendai/core
- typescript

## Writes

- <host workspace>/.mcp-vertex/cache/refactor/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/refactor/src/lib/codemod/codemod-runner.spec.ts
- plugins/refactor/src/lib/codemod/recipes.spec.ts
- plugins/refactor/src/lib/nav/nav-engine.spec.ts
- plugins/refactor/src/lib/rename/rename-planner.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

