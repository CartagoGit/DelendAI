---
id: r00645
title: "Core and tooling take the workspace root from their caller, never process.cwd()"
kind: refactor
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 38cedded-0963-4b16-8776-a91d6656c5de
last-correlation-id: 38cedded-0963-4b16-8776-a91d6656c5de
last-transition-from: ready
last-transition-at: 2026-10-31T22:43:34.733Z
shipped-in:
  - "90b4a58faf62"
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
- **Status**: done
- **Files**: `packages/core/src/lib/tools/shell-status.tool.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/manifest/discovery.ts`, `packages/core/src/lib/plugins/discovery.ts`, `packages/core/src/lib/shared/hook-free-environment.helper.ts`, `packages/core/tests/src/lib/shared/hook-free-environment.helper.spec.ts`, `packages/core/tests/src/lib/tools/shell-status.spec.ts`, `packages/core/tests/src/lib/tools/shell-status-defaults.spec.ts`, `tools/scripts/lint/no-process-cwd-in-core.script.ts`, `tools/scripts/lint/no-process-cwd-in-core.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "A lint fails on process.cwd() in packages/core/src/lib outside entry points, with the current uses removed (G1, D8)."
- shipped-in: `90b4a58faf62`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 90b4a58faf62, validate exit 0 and tests 15/15 claimed, no recorded run cited; acceptance 1/1: (1) The lint exists at tools/scripts/lint/no-process-cwd-in-core.script.ts with SCAN_ROOT = packages/core/src/lib (line 21), so the entry points under packages/cor… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 4 files / 15 tests, exit 0, and the lint itself exits 0. Non-blocking observation: the lint's failure path has no automated test, only its detector helpers are unit-tested.

### S2 — tooling
- **Status**: pending
- **Files**: `tools/scripts/build/stable-manifest.script.ts`, `tools/scripts/gen/quantitative.script.ts`, `tools/scripts/i18n/translate-tutorials.script.ts`
- **Gate**: type
- acceptance:
  - "Scripts resolve the root from their own location; the stray .js and .mjs files are gone: the .js was a stale copy of its .ts and nothing loads the .mjs (G14)."
- shipped-in: `90b4a58faf62`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by minimax-m3.1-flash-preview — The stray JavaScript is still here. tools/scripts/build/stable-manifest.spec.js (63 lines) remains beside stable-manifest.spec.ts, and its line 7 still reads the repo root with const REPO_ROOT = process.cwd(); - the exact pattern this slice removed from the stale twin stable-manifest.script.js, which it deleted. The proposal's goal also says the two stray JavaScript files become TypeScript, while the delivery deleted them instead of porting them (its own notes disclose this for zod-default-resolver.mjs). How to reproduce: ls tools/scripts/build/ shows stable-manifest.spec.js; grep -n 'process.cwd()' tools/scripts/build/stable-manifest.spec.js prints line 7. What must hold to approve: delete or port the remaining stray .js, extend the acceptance bullet to name it, and correct the goal line to say the stray files are removed rather than ported. The .mjs named by the criterion (zod-default-resolver.mjs) is indeed gone and the named .js (stable-manifest.script.js) is gone; this verdict is about the third stray file the slice left behind.

## acceptance

- A lint fails on process.cwd() in packages/core/src/lib outside entry points, with the current uses removed (G1, D8).
- Scripts resolve the root from their own location; the stray .js and .mjs files are gone: the .js was a stale copy of its .ts and nothing loads the .mjs (G14).

## notes

- The lint blanks comments and string text before matching, so a comment or a scaffold template that writes `process.cwd()` into a generated entry point is not a finding. TypeScript 7 ships no JavaScript AST API, so the source is not parsed.
- A linked worktree's hook is now the worktree its `gitdir` file names; before, it was whatever directory the process ran in.
- `zod-default-resolver.mjs` was removed instead of ported: no vitest alias points at it any more.
