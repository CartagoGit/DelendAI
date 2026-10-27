---
id: r00645
title: "Core and tooling take the workspace root from their caller, never process.cwd()"
kind: refactor
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: b84780c0-e403-4240-89cb-94a3b7be4f92
last-correlation-id: b84780c0-e403-4240-89cb-94a3b7be4f92
last-transition-from: ready
last-transition-at: 2026-10-27T04:50:55.657Z
---

# r00645 — Core and tooling take the workspace root from their caller, never process.cwd()

## goal

No library module in core reads process.cwd() as a workspace root, scripts resolve the repo root from their own location or an argument, and the two stray JavaScript files become TypeScript.

## why

Joint audit a00095. G1: shell-status.tool.ts builds InstallSuggestionsService with process.cwd(). D8: more process.cwd() in core than the first pass saw. G14: tooling treats process.cwd() as the repo root and two loose JS files remain (stable-manifest.script.js, zod-default-resolver.mjs).

## non-goals

- Changing what any tool does; only where it reads the root from.

## slices

- global_gate: type

### S1 — core
- **Status**: pending
- **Files**: `packages/core/src/lib/tools/shell-status.tool.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/manifest/discovery.ts`, `packages/core/src/lib/plugins/discovery.ts`, `packages/core/src/lib/shared/hook-free-environment.helper.ts`, `packages/core/tests/src/lib/shared/hook-free-environment.helper.spec.ts`, `packages/core/tests/src/lib/tools/shell-status.spec.ts`, `packages/core/tests/src/lib/tools/shell-status-defaults.spec.ts`, `tools/scripts/lint/no-process-cwd-in-core.script.ts`, `tools/scripts/lint/no-process-cwd-in-core.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "A lint fails on process.cwd() in packages/core/src/lib outside entry points, with the current uses removed (G1, D8)."

### S2 — tooling
- **Status**: pending
- **Files**: `tools/scripts/build/stable-manifest.script.js`, `tools/scripts/build/stable-manifest.script.ts`, `tools/scripts/gen/quantitative.script.ts`, `tools/scripts/i18n/translate-tutorials.script.ts`, `tools/scripts/lib/zod-default-resolver.mjs`
- **Gate**: type
- acceptance:
  - "Scripts resolve the root from their own location; the stray .js and .mjs files are gone: the .js was a stale copy of its .ts and nothing loads the .mjs (G14)."

## acceptance

- A lint fails on process.cwd() in packages/core/src/lib outside entry points, with the current uses removed (G1, D8).
- Scripts resolve the root from their own location; the stray .js and .mjs files are gone: the .js was a stale copy of its .ts and nothing loads the .mjs (G14).

## notes

- The lint blanks comments and string text before matching, so a comment or a scaffold template that writes `process.cwd()` into a generated entry point is not a finding. TypeScript 7 ships no JavaScript AST API, so the source is not parsed.
- A linked worktree's hook is now the worktree its `gitdir` file names; before, it was whatever directory the process ran in.
- `zod-default-resolver.mjs` was removed instead of ported: no vitest alias points at it any more.
