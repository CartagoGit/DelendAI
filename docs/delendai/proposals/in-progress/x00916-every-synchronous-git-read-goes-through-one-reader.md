---
id: x00916
title: "Every synchronous git read goes through one reader"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-18
last-transition-id: 24ddb49a-d0ac-49f3-bd10-ce1abf5309c0
last-correlation-id: 24ddb49a-d0ac-49f3-bd10-ce1abf5309c0
last-transition-from: ready
last-transition-at: 2026-11-01T13:04:42.050Z
shipped-in:
  - "336f3fede"
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

- **Status**: done
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
- shipped-in: `80351b98b67c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 336f3fede, validate exit 0, tests 6/6; acceptance 2/2: (1) Both readers live where the criterion says, with the options it names, and they are exported where everyone can reach them. packages/core/src/lib/shared/git-re… (2) The one command wrapper is now one wrapper. packages/core/src/lib/shared/git-command.helper.ts holds runGitCommand: it answers {ok: true, out} with git's trimm… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: readGit and gitVerbatim live in packages/core/src/lib/shared/git-read.helper.ts, take maxBuffer and input, are exported from @delendai/core/runtime (runtime/index.ts:66) and re-exported by work-unit-shared.service.ts, and gitVerbatim no longer passes a hook's GIT_DIR through - the spec 'answers about the repository asked, not the one a hook names' proves it. runGitCommand is the one {ok, out} wrapper (packages/core/src/lib/shared/git-command.helper.ts), hook-safe, taking extra variables and with the hookFree switch for a nested command under a merge's index; the four modules that carried such a wrapper now use it. The two helper specs pass 6/6. Delivery: the slice's own commit is a1c4ff2c2 ('one synchronous git read, in shared, for everyone'); note that the proposal's shipped-in for this slice names 80351b98b67c, which is the next slice's commit (the packages), so the shipped-in bookkeeping for S1 and S2 is shifted by one.

### S2 — The packages read through it

- **Status**: done
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
- shipped-in: `a57671985e95`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 336f3fede, validate exit 0, tests 6/6; acceptance 1/1: (1) Every plain-read or {ok, out} wrapper under packages/ and plugins/ delegates to the shared helpers, and the ones that stay are exactly the five the criterion n… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: a sweep of every non-spec .ts under packages/ and plugins/ finds no plain-read or {ok, out} git wrapper left that neither delegates to the shared helpers nor is one of the five the criterion names (guard-hooks.service.ts, unit-ref-rename.service.ts, proposal-markdown-at-commit.ts, the test kit's working-state.helper.ts, and the async stale-runtime-advisory.ts), each of which keeps the reason the criterion gives for it. Delivery: commit 80351b98b67c ('the packages read and run git through one helper each'), merged as 336f3fede (PR #1219).

### S3 — The scripts read through it

- **Status**: pending
- **Files**:
  - `tools/scripts/lint/publication-scope.script.ts`
  - `tools/scripts/git/prepare-clone.script.ts`
  - `tools/scripts/git/ended-reservations.service.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `tools/scripts/ci/changed-file-coverage.script.ts`
  - `tools/scripts/ci/test-zones.script.ts`
  - `tools/scripts/forge/candidate-footprint.ts`
  - `tools/scripts/forge/queue-acceptance.ts`
  - `tools/scripts/gen-all.script.ts`
  - `tools/scripts/git/clone-hygiene.script.ts`
  - `tools/scripts/host/workspace-forge-slug.helper.ts`
  - `tools/scripts/lib/git-file-origin.ts`
  - `tools/scripts/lint/proposal-hygiene.script.ts`
  - `tools/scripts/lint/proposal-ready-to-close.script.ts`
  - `tools/scripts/release/derive-version.script.ts`
  - `tools/scripts/telemetry/drain-telemetry.script.ts`
  - `tools/scripts/test/read-test-journal.script.ts`
- **Gate**: type
- acceptance:
  - "Every `tools/scripts` wrapper of the plain-read shape (try `execFileSync('git', …)`, trimmed or not, `''` or `undefined` on failure) delegates to the reader from `@delendai/core/runtime`, and the three that strip a hook's variables on purpose use `runGitCommand` with `hookFree`. The hook scripts stay as they are: run in the hook's own worktree, they mean to answer about it (`refuse-integration-commit` reads the commit being made), and the reader would answer about `repoRoot()` instead when that is another checkout. The other shapes stay too, named: throwing wrappers (`lint/candidate-delivers`, `lint/verdicts-through-the-tool`, `lint/closed-with-independent-approval`, `reclaim/reclaim-local`, `forge/sync-with-integration`, `git/rewrite-llm-attribution`), `spawnSync` with a status check (`forge/release-checkout`, `lint/no-llm-attribution`), untrimmed large-buffer reads (`reclaim/reclaim-worktrees`, `lint/publication-scope` before this slice), and inline calls without a wrapper. `test/journal-reporter` stays too: a vitest reporter loads before the workspace aliases exist, so it cannot import the reader."
- shipped-in: `d649733e9637`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by minimax-m3.1-flash-preview — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Changes requested on the first clause only: the three hook-stripping scripts do use runGitCommand with hookFree, the hook script and the named shapes stay, but 18 plain-read wrappers under tools/scripts - in 15 files - still wrap execFileSync('git', ...) themselves and are in none of the criterion's named lists (the full list is in the evidence). The slice converted six scripts this way, so the remainder is the same mechanical change. Delivery: commit d649733e9637 ('the scripts read git through the shared reader'), merged as 336f3fede (PR #1219).

## acceptance

- A plain synchronous git read has one implementation, and it is hook-safe.
