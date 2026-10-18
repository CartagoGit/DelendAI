---
id: x00916
title: "Every synchronous git read goes through one reader"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-18
---

# x00916 — Every synchronous git read goes through one reader

## goal

A synchronous git read anywhere in the repository (core, CLI, plugins, test kit, tools) goes through one reader that is safe inside a git hook, so every component answers about the repository it was asked about and fails the same way. When this is done no module carries its own `execFileSync('git', …)` wrapper for a plain read.

## why

`readGit` (`packages/core/src/lib/work-units/work-unit-shared.service.ts`) already reads git with `gitEnvironmentFor(cwd)`, which drops what a hook told git about its own worktree when the command runs elsewhere; 32 modules use it. Measured 2026-10-18, 30 more modules define their own `const git = (…)` around `execFileSync`/`spawnSync`: two pairs are byte-identical, the rest differ in what a failure returns (`undefined` or `''`), whether output is trimmed, the buffer size and the stderr handling, and all but a handful pass `process.env` untouched. Some run inside hooks (`tools/scripts/hooks/refuse-integration-commit.script.ts`, `packages/cli/src/commands/guard.command.ts`), where an inherited `GIT_DIR` makes `git -C <other worktree>` answer about the hook's worktree, the failure `gitEnvironmentFor` documents.

## non-goals

- Async git (`createGitRunner`) and writes (`git-write`), which already have one implementation each.
- Wrappers whose semantics a plain read does not cover (a throwing `spawnSync` with a status check, a `{ ok, out }` result used to branch on exit status): they stay, named in the slice, unless the reader grows that option.

## slices

- global_gate: type

### S1 — One reader, where everyone can reach it

- **Status**: pending
- **Files**: `packages/core/src/lib/shared/git-read.helper.ts`
- **Gate**: type
- acceptance:
  - "`readGit` (hook-safe, trimmed, `undefined` on failure) and its untrimmed sibling live in `packages/core/src/lib/shared/`, take an optional `maxBuffer`, and are exported to plugins, the CLI and tools (`@delendai/core/runtime`); `work-unit-shared.service.ts` re-exports them so its 32 importers do not move."

### S2 — The packages read through it

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/forge-work-refs.service.ts`
- **Gate**: type
- acceptance:
  - "Every plain-read `git` wrapper under `packages/` and `plugins/` (core work-units and development-policy, CLI guard, test kit, proposals) is replaced by the reader; each one that stays is named in the slice with the option it needs."

### S3 — The scripts read through it

- **Status**: pending
- **Files**: `tools/scripts/hooks/refuse-integration-commit.script.ts`
- **Gate**: type
- acceptance:
  - "Every plain-read `git` wrapper under `tools/scripts/` is replaced by the reader from `@delendai/core/runtime`, the hook scripts first; each one that stays is named in the slice."

## acceptance

- A plain synchronous git read has one implementation, and it is hook-safe.
