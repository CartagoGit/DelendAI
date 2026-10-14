---
id: x00892
title: "a proposal's wip branch lives exactly while the proposal is in progress, and what it holds is integrated when it leaves"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: bdb34a0b-53b6-4cd2-b36f-5ce02f3dc27f
last-correlation-id: bdb34a0b-53b6-4cd2-b36f-5ce02f3dc27f
last-transition-from: review
last-transition-at: 2026-10-14T11:10:21.198Z
shipped-in:
  - "10a3f4572b5ce24debebc568d00094c47af4a8db"
---

# x00892 — a proposal's wip branch lives exactly while the proposal is in progress, and what it holds is integrated when it leaves

## goal

Whenever a proposal leaves in-progress (to review, ready, blocked, paused or done), whatever its wip branch holds is integrated the way the project's work model says, a pull request, a merge or a direct push, and the branch and its worktree end; while it is in progress it is one branch, pushed on every commit, resumable from any machine. One lifecycle, reused by every entry point, whatever host, model or work model.

## why

The owner, 2026-10-13, refining x00891: the wip branch should disappear only when the proposal's last pull request is made, or when the proposal is about to become blocked or paused, and always after a pull request of what the branch holds, so the work done is saved as far as it got. A proposal left half-done in ready while another one goes on must have its branch's work published, and then the branch goes. Other work models do the same, with a merge, or whatever the methodology says, in place of the pull request. No worktree is left hanging or half-done where the work cannot be resumed elsewhere, and a proposal already in progress does not open wip after wip and pull request after pull request. A proposal stops being in progress only when its work is handed over to be merged; when it moves to any other state, what is done goes to the main branch (develop here, whatever another project calls it). This must have one source of truth that everything reuses, idempotent and agnostic of host, model and work model. Without branches or worktrees, it commits or pushes directly where the model says.

What x00891 (merged in #1066) does instead:

1. **The branch outlives the state that justified it.** `proposalStillOpen` keeps a proposal's branch until the proposal is done, so a proposal moved to review, ready, blocked or paused keeps a branch and a worktree that nobody will work on until it comes back.
2. **Leaving in-progress publishes nothing.** Moving a proposal out of in-progress is a commit on its unit like any other. What the branch holds reaches the integration branch only if somebody remembers `work publish`, and a proposal parked in ready half-done keeps its work on a side branch.
3. **Each entry point decides for itself.** The publish command, the reaper, the standings and the doctor each read "is this unit's proposal still going" through their own call. The moment the state changes acts on none of them.

## non-goals

- Changing how each work model integrates: `work publish` already opens a pull request, merges through the local gate, or commits directly, by the resolved policy.
- Moving proposals between states: the proposals workflow keeps that; this reacts to the move, by whoever made it.

## slices

- global_gate: type

### S1 — In progress is the one state that keeps a wip branch

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/src/lib/work-units/work-unit-publish.service.ts`
  - `packages/core/src/lib/work-units/unit-standings.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/proposal-branch.service.ts`
  - `packages/core/src/lib/work-units/work-unit-generation.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `tools/scripts/inspect/core-proposals-boundary.script.ts`
  - `docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md`
  - `packages/core/tests/src/lib/work-units/publication-target.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/proposal-branch.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`
- **Gate**: type
- acceptance:
  - One function says whether a unit's proposal is in progress, read on the unit's own tip. The publish command, the standings, the reaper and the doctor all ask it, and none keeps a reading of its own.
  - A publication from a proposal in progress keeps the branch and its worktree. One from a proposal in any other state ends them, after the publication is proven.
  - Later work on a proposal in progress continues on its branch, whatever kind or slice it is entered for, however the template spells `refs/heads/`. A second session of the same agent working in parallel gets its own unit instead of being refused.
- shipped-in: `f40a7f7af195`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: requested_changes by gpt-5.4 — The focused gate for the work-unit branch/publication changes does not pass. Running typecheck plus the targeted work-unit specs left the suite at 117/118, with work-unit.service.spec.ts still failing the case 'names what a publication is missing instead of guessing'. Instead of refusing work publish --proposal=x00553 --slice=S1 with the missing --agent guidance, the current behavior now guesses a work ref and errors with 'resolve-work-ref: refs/heads/delendai/wip/gpt-5.4/implement/x00553-S1-g1/work does not exist'. That regression sits directly in the branch/publication path this slice changes, so I cannot accept S1 until the publish/enter path preserves the expected refusal behavior and the focused suite is green.

### S2 — Leaving in-progress integrates what the branch holds, then ends it

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/unit-leaves-progress.service.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/core/tests/src/lib/work-units/unit-leaves-progress.service.spec.ts`
- **Gate**: type
- acceptance:
  - A commit on a unit's branch that moves its proposal out of `in-progress/` (to review, ready, blocked, paused or done), made by any tool, host or person, is followed at once by the unit's publication through the work model's own path: a pull request, a merge through the local gate, or nothing to do for a model without branches. The branch and its worktree end once that is proven.
  - The publication runs detached from the commit (it removes the worktree the hook runs in) and logs to `delendai-unit-publications.log` in the repository's git directory. Run again, it finds nothing to do; one the forge refuses leaves the branch, pushed, and the next start retries it (S3).
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `f40a7f7af195`

### S3 — A unit whose proposal left in-progress on another machine is integrated at start

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
  - `packages/core/src/lib/contracts/interfaces/unit-forge-sync.interface.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - At start, a unit of this clone whose proposal is no longer in progress on its own tip, that still holds work the integration branch lacks, and whose owner is not live, is published through `work publish` (the same path as S2) and its branch ends. A live unit is left to its owner's hook. A review unit is not one of these.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `f40a7f7af195`

### S4 — A hook the project's lefthook.yml declares runs, and is not called installed before it does

- **Status**: done
- **Files**:
  - `packages/cli/src/lib/guard-hooks.service.ts`
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.ts`
  - `packages/cli/src/lib/guard-hooks.service.spec.ts`
  - `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`
- **Gate**: type
- evidence: after x00891 added a `post-commit` section to `lefthook.yml`, `delendai guard status` reported `post-commit: installed` on this clone while `.git/hooks/post-commit` did not exist: lefthook writes a hook's script only at `lefthook install`, and the guard counted a declared section as installed. Commits in units were not pushed.
- acceptance:
  - A hook whose section runs the guard but whose script lefthook has not written is reported `absent`, naming `lefthook install`.
  - At start, the project's own lefthook installs what its configuration declares, so the next commit runs the hook. Nothing else is written.
- shipped-in: `2e7f2750e44a`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 10a3f4572b5c, validate exit 0, tests 25/25 — Reviewed x00892 S4 independently from the work-unit slices. The guard now reports declared-but-uninstalled lefthook hooks as absent, startup installs the project declared lefthook hooks through lefthook itself, and the focused guard-hooks specs passed 25/25 with typecheck still green.

## acceptance

- A wip branch exists exactly while its proposal is in progress.
- Whatever the proposal's next state, the work its branch held is in a pull request, merged, or committed where the work model says, before the branch goes.
