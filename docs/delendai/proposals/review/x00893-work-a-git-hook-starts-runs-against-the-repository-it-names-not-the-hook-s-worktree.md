---
id: x00893
title: "work a git hook starts runs against the repository it names, not the hook's worktree"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: 3a3b8fe3-7fef-4814-8c08-eef0e9543526
last-correlation-id: 3a3b8fe3-7fef-4814-8c08-eef0e9543526
last-transition-from: in-progress
last-transition-at: 2026-10-14T03:37:19.663Z
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

- **Status**: review
- **Files**:
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/core/src/lib/shared/hook-free-environment.helper.ts`
  - `packages/core/src/cli.ts`
  - `packages/core/tests/src/lib/shared/hook-free-environment.helper.spec.ts`
- **Gate**: type
- acceptance:
  - The process the `post-commit` hook starts has none of `HOOK_GIT_ENVIRONMENT` in its environment, so its git commands answer about the checkout it is started in.
  - A spec runs git through the helper's environment from inside a hook-like environment pointing at another repository, and it reads the repository named by `cwd`.
- shipped-in: `c0e5842ff516`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The start pass publishes only a unit whose proposal left in-progress on it

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - At start, a unit is published for leaving in-progress only when one of its own commits (beyond the integration branch) had its proposal in progress and its tip no longer has. A unit that created a proposal and is still writing it is left alone.
- shipped-in: `c0e5842ff516`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — A new proposal that edits existing files and adds one does not redden the integration branch

- **Status**: review
- **Files**:
  - `tools/scripts/lint/proposal-already-implemented.script.ts`
  - `tools/tests/lint/proposal-already-implemented.spec.ts`
- **Gate**: type
- evidence: on 2026-10-14 `lint:proposals` failed on develop, and on every pull request, with five slices of the ready proposals f00759, f00760 and f00761 called `partial`. Each edits files that exist and adds a new module: not started, not half-done. A slice whose files were all tracked was already judged by whether they predate the proposal; a slice with some tracked was not, and the comparison was by day, so a file created hours before its proposal the same day counted as the slice's own.
- acceptance:
  - A slice whose tracked files all predate the proposal, by the instant the proposal's document was added, is "modifies existing" whether or not its new files exist yet, and never counted as stuck.
  - A tracked file created after the proposal still makes the slice partial.
- shipped-in: `c0e5842ff516`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A unit in use keeps its dependencies

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/idle-unit-dependencies.service.ts`
  - `packages/core/src/lib/work-units/work-unit-reap.service.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/core/tests/src/lib/work-units/idle-unit-dependencies.service.spec.ts`
- **Gate**: type
- evidence: on 2026-10-14 the `node_modules` of the units of x00892 and x00893 were removed three times while their agent was running commands in them (`Cannot find module yaml`, `better-sqlite3`). x00889 S4 released the dependencies of any unit not `live`. The lease heartbeat only moves on delendai's own commands, so an agent working in its tree for half an hour looked idle.
- acceptance:
  - Only an abandoned unit whose worktree has not been written within the lease window loses its dependencies.
  - A commit on a unit's branch renews its heartbeat (`post-commit`).
- shipped-in: `c0e5842ff516`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A proposal leaving in-progress has its pull request opened and its branch ended by the hook alone.
- A proposal being written is never published half-written by the start pass.
