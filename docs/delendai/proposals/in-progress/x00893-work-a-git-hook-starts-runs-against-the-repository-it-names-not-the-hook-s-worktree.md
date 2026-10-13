---
id: x00893
title: "work a git hook starts runs against the repository it names, not the hook's worktree"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: 04568291-94f4-4fcc-afde-a575c2fc1379
last-correlation-id: 04568291-94f4-4fcc-afde-a575c2fc1379
last-transition-from: ready
last-transition-at: 2026-10-13T22:03:58.218Z
---

# x00893 — work a git hook starts runs against the repository it names, not the hook's worktree

## goal

Anything delendai starts from inside a git hook, the publication that follows a proposal leaving in-progress first, runs without the variables git exports to that hook, so it reads and writes the repository it was given instead of the worktree the hook ran in.

## why

Two departures on 2026-10-14, the night x00892 merged:

1. **A hook's environment leaked into what it started.** f00760 left in-progress and the `post-commit` hook published it, as designed: its pull-request ref was pushed and proven, and its worktree removed. Every step after that failed. `remove-remote-work-ref` and `remove-work-ref` answered `fatal: not a git repository: .git/worktrees/claude-opus-5-5-f00760-all`, and the pull request was skipped because "`origin` is not recognised as a GitHub remote (its URL could not be read)". The detached `work publish` inherited `GIT_DIR`, `GIT_INDEX_FILE` and the other variables git exports to a hook, so every git command it ran answered about the worktree it had just removed. A retry from the shared checkout opened #1069. `HOOK_GIT_ENVIRONMENT` already names those variables; the code that starts work from a hook did not use it.
2. **The start pass published a proposal while it was being written.** This proposal's own unit was published as #1070 seconds after `proposals create`, with its template text, because the server's start pass (x00892 S3) publishes "a unit whose proposal is not in progress and holds work". A unit that only created its proposal never had it in progress: it did not leave anything. Its owner was not counted as live either, because the unit had just been renamed from `new` to its id.

## non-goals

- Changing when a proposal that really left in-progress is published.

## slices

- global_gate: type

### S1 — Work a hook starts runs in the repository it names

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/core/src/lib/shared/hook-free-environment.helper.ts`
  - `packages/core/src/cli.ts`
  - `packages/core/tests/src/lib/shared/hook-free-environment.helper.spec.ts`
- **Gate**: type
- acceptance:
  - The process the `post-commit` hook starts has none of `HOOK_GIT_ENVIRONMENT` in its environment, so its git commands answer about the checkout it is started in.
  - A spec runs git through the helper's environment from inside a hook-like environment pointing at another repository, and it reads the repository named by `cwd`.

### S2 — The start pass publishes only a unit whose proposal left in-progress on it

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - At start, a unit is published for leaving in-progress only when one of its own commits (beyond the integration branch) had its proposal in progress and its tip no longer has. A unit that created a proposal and is still writing it is left alone.

## acceptance

- A proposal leaving in-progress has its pull request opened and its branch ended by the hook alone.
- A proposal being written is never published half-written by the start pass.
