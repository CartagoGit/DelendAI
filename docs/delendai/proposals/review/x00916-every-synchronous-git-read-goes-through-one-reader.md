---
id: x00916
title: "Every synchronous git read goes through one reader"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-18
last-transition-id: 137440f2-b973-43db-b0a7-2e48163c1f3e
last-correlation-id: 137440f2-b973-43db-b0a7-2e48163c1f3e
last-transition-from: in-progress
last-transition-at: 2026-10-18T11:48:51.904Z
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

- **Status**: review
- **Files**:
  - `packages/core/src/lib/shared/git-read.helper.ts`
  - `packages/core/src/lib/shared/git-command.helper.ts`
  - `packages/core/src/lib/contracts/interfaces/git-read.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/git-command.interface.ts`
  - `packages/core/src/lib/work-units/work-unit-shared.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/shared/git-read.helper.spec.ts`
  - `packages/core/tests/src/lib/shared/git-command.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "`readGit` (hook-safe, trimmed, `undefined` on failure) and `gitVerbatim` (untrimmed) live in `packages/core/src/lib/shared/git-read.helper.ts`, take `maxBuffer` and `input`, and are exported from `@delendai/core/runtime`; `work-unit-shared.service.ts` re-exports them so its importers do not move. `gitVerbatim` used to pass a hook's `GIT_DIR` through; it no longer does."
  - "Four modules also carried a command wrapper answering `{ ok, out }` with git's stderr on failure; `runGitCommand` (`shared/git-command.helper.ts`, hook-safe, extra variables, a `hookFree` switch for nested commands under a merge's index) is that one wrapper."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `80351b98b67c`

### S2 — The packages read through it

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/hidden-work.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/lib/work-units/work-swarm.service.ts`
  - `packages/core/src/lib/work-units/work-publish.service.ts`
  - `packages/core/src/lib/work-units/local-certification.service.ts`
  - `packages/core/src/lib/work-units/worktree-husks.service.ts`
  - `packages/core/src/lib/development-policy/default-branch.ts`
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/review.command.ts`
  - `packages/cli/src/lib/generated-refresh.service.ts`
  - `packages/cli/src/lib/generated-merge-driver.service.ts`
  - `packages/cli/src/lib/review/review-releases.service.ts`
  - `packages/cli/src/lib/review/review-pack-check.service.ts`
- **Gate**: type
- acceptance:
  - "Every plain-read or `{ ok, out }` git wrapper under `packages/` and `plugins/` delegates to the shared helpers. The ones that stay, each for the option it needs: `packages/cli/src/lib/guard-hooks.service.ts` (`locateHooks` throws when git cannot say), `packages/core/src/lib/work-units/unit-ref-rename.service.ts` (throws, so a failed step aborts the rename), `plugins/proposals/src/lib/services/proposal-markdown-at-commit.ts` (binary `Buffer` output, throws), `packages/test-kit/src/lib/working-state.helper.ts` (the test kit does not depend on core), and the async `stale-runtime-advisory.ts` (a non-goal)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `a57671985e95`

### S3 — The scripts read through it

- **Status**: review
- **Files**:
  - `tools/scripts/lint/publication-scope.script.ts`
  - `tools/scripts/git/prepare-clone.script.ts`
  - `tools/scripts/git/ended-reservations.service.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
- **Gate**: type
- acceptance:
  - "Every `tools/scripts` wrapper of the plain-read shape (try `execFileSync('git', …)`, trimmed or not, `''` or `undefined` on failure) delegates to the reader from `@delendai/core/runtime`, and the three that strip a hook's variables on purpose use `runGitCommand` with `hookFree`. The hook scripts stay as they are: run in the hook's own worktree, they mean to answer about it (`refuse-integration-commit` reads the commit being made), and the reader would answer about `repoRoot()` instead when that is another checkout. The other shapes stay too, named: throwing wrappers (`lint/candidate-delivers`, `lint/verdicts-through-the-tool`, `lint/closed-with-independent-approval`, `reclaim/reclaim-local`, `forge/sync-with-integration`, `git/rewrite-llm-attribution`), `spawnSync` with a status check (`forge/release-checkout`, `lint/no-llm-attribution`), untrimmed large-buffer reads (`reclaim/reclaim-worktrees`, `lint/publication-scope` before this slice), and inline calls without a wrapper."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `d649733e9637`

## acceptance

- A plain synchronous git read has one implementation, and it is hook-safe.
