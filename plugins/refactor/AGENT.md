# AGENT.md — plugin `plugins/refactor`

> Below the `<!-- delendai:begin agent-md -->
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
- zod
- typescript

## Writes

- <host workspace>/.delendai/cache/refactor/

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
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

