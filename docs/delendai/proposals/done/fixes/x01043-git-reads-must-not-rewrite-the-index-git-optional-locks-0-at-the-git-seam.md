---
id: x01043
title: "Git reads must not rewrite the index: GIT_OPTIONAL_LOCKS=0 at the git seam"
kind: fix
status: done
type: proposal
track: ci
date: 2026-11-07
last-transition-id: 9a457103-61bb-4766-b45b-64e05d4cacc0
last-correlation-id: 9a457103-61bb-4766-b45b-64e05d4cacc0
last-transition-from: review
last-transition-at: 2026-11-10T03:12:28.597Z
shipped-in:
  - "6578eb7c5"
---

# x01043 — Git reads must not rewrite the index: GIT_OPTIONAL_LOCKS=0 at the git seam

## goal

Run every git read with GIT_OPTIONAL_LOCKS=0 (shared runners plus a process default), lint that no spawn drops it, and spec that status leaves the index mtime unchanged.

## why

PR #1812's full run (42364090265) failed `reclaim-worktrees` because the dry run's plain `git status` rewrote the spent worktree's index: the file whose mtime dates its activity, so the applying run judged it busy. The same hazard holds wherever a read-only git runs without `GIT_OPTIONAL_LOCKS=0` (77 `git status` call sites): it corrupts activity-based liveness (x01041) and contends for `index.lock` between agents.

## non-goals

- Rewriting the ~80 direct git call sites: they inherit the process default.

## slices

- global_gate: none

### S1 — Seam environment, process default, lint and spec
- **Status**: done
- **Files**: `packages/core/src/lib/shared/git-optional-locks.helper.ts`, `packages/core/src/lib/shared/hook-free-environment.helper.ts`, `packages/core/src/lib/wip-engine/git-command.ts`, `packages/core/src/lib/cli/run-cli.ts`, `tools/scripts/host/host-server.script.ts`, `tools/scripts/lint/git-optional-locks.script.ts`, `tools/scripts/lint/git-optional-locks.helper.ts`, `tools/scripts/lint/git-optional-locks.helper.spec.ts`, `packages/core/tests/src/lib/shared/git-optional-locks.helper.spec.ts`, `packages/core/tests/src/lib/shared/hook-free-environment.helper.spec.ts`, `package.json`
- **Gate**: none
- shipped-in: `c45ee9011796`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 6578eb7c5, validate exit 0 and tests 15/15 claimed, no recorded run cited; acceptance 4/4: (1) packages/core/src/lib/shared/hook-free-environment.helper.ts:21,59,61 build env via withoutOptionalLocks; packages/core/src/lib/wip-engine/git-command.ts:98 too (2) applyGitOptionalLocksDefault (??= '0') called at run-cli.ts:250 and host-server.script.ts:290; spec 'the process default keeps a choice the caller made' green (3) package.json:96 script, chained in lint:architecture (:137); git-optional-locks.script.ts:56 entry check and helper dropsInheritedEnvironment/BARE_ENV; helper … (4) packages/core/tests/src/lib/shared/git-optional-locks.helper.spec.ts:39 (premise: plain status rewrites), :48 runGitCommand, :55 work-ref engine runner leave m… — GIT_OPTIONAL_LOCKS=0 at both seams and as process default in CLI and host server; lint in lint:architecture passes; mtime spec green

## acceptance

- The shared git runners and the work-ref runner run git with `GIT_OPTIONAL_LOCKS=0`.
- The CLI and the host server set it as the process default; a caller's own choice is kept.
- `lint:git-optional-locks` (in `lint:architecture`) fails an entry that does not install the default and a git spawn whose `env` spreads nothing in.
- A spec shows a status run through the seams leaves the index mtime unchanged.
