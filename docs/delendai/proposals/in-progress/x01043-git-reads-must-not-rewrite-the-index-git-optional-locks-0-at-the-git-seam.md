---
id: x01043
title: "Git reads must not rewrite the index: GIT_OPTIONAL_LOCKS=0 at the git seam"
kind: fix
status: in-progress
type: proposal
track: ci
date: 2026-11-07
last-transition-id: 9d4b7510-5ba5-4ff3-8fa1-9744f1edad46
last-correlation-id: 9d4b7510-5ba5-4ff3-8fa1-9744f1edad46
last-transition-from: ready
last-transition-at: 2026-11-07T11:12:23.271Z
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
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/git-optional-locks.helper.ts`, `packages/core/src/lib/shared/hook-free-environment.helper.ts`, `packages/core/src/lib/wip-engine/git-command.ts`, `packages/core/src/lib/cli/run-cli.ts`, `tools/scripts/host/host-server.script.ts`, `tools/scripts/lint/git-optional-locks.script.ts`, `tools/scripts/lint/git-optional-locks.helper.ts`, `tools/scripts/lint/git-optional-locks.helper.spec.ts`, `packages/core/tests/src/lib/shared/git-optional-locks.helper.spec.ts`, `packages/core/tests/src/lib/shared/hook-free-environment.helper.spec.ts`, `package.json`
- **Gate**: none

## acceptance

- The shared git runners and the work-ref runner run git with `GIT_OPTIONAL_LOCKS=0`.
- The CLI and the host server set it as the process default; a caller's own choice is kept.
- `lint:git-optional-locks` (in `lint:architecture`) fails an entry that does not install the default and a git spawn whose `env` spreads nothing in.
- A spec shows a status run through the seams leaves the index mtime unchanged.
