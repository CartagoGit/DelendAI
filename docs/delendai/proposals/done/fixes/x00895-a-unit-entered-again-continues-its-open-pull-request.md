---
id: x00895
title: "a unit entered again continues its open pull request"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-14
last-transition-id: 26cf35fa-f4f9-4467-ab73-a3a18eb026d5
last-correlation-id: 26cf35fa-f4f9-4467-ab73-a3a18eb026d5
last-transition-from: review
last-transition-at: 2026-10-14T10:45:06.468Z
shipped-in:
  - "a448ff44107f8fe3e620e3844d7bfc5c1bfe7cd8"
---

# x00895 — a unit entered again continues its open pull request

## goal

`work enter` for a unit whose work ref is gone but whose publication is still on the forge, and has not landed, creates the work ref at that publication's tip, not at the integration branch.

## why

On 2026-10-14 #1073 (x00894) had a conflict with develop. Its work branch had ended when it was published, as designed. `work enter --kind=create --proposal=x00894 --topic=outside-review-2026-10-13 --generation=1` created the same unit again, but from develop: the worktree held none of the pull request's commits. Publishing from there would have pushed `delendai/pr/...` without the work it was opened for. The conflict could be resolved only by merging the publication branch in by hand. The implement path at least refuses with that advice when the forge reservation names the entrant's own unit. The create path, and an implement unit entered under its own name, got no word at all.

## non-goals

- Bringing the publication up to date with the integration branch: the unit starts where its pull request is, and merging develop in stays the agent's step, as it is for any unit.
- A publication that has landed: its unit starts from the integration base, which already holds it.

## slices

- global_gate: type

### S1 — A new work ref starts at its unit's unlanded publication

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/unit-start-point.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-start-point.service.spec.ts`
- **Gate**: type
- acceptance:
  - A work ref created by `work enter` whose publication branch exists on the integration remote, and is not an ancestor of the integration base, points at that publication's tip.
  - With no publication, or one that has landed, or a branch outside the work and publication prefixes, the work ref starts at the integration base, as before.
- shipped-in: `875a9f27a588`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at a448ff44107f, validate exit 0, tests 4/4 — Delivery attribution: the work landed as 875a9f27a588 inside PR #1076 and reached develop through the merge a448ff441, whose first-parent diff touches exactly the three declared files, so that is the commit approved here. Gate type: `bun run typecheck` exit 0 in the pack worktree. Tests: `bun x vitest run --root packages/core tests/src/lib/work-units/unit-start-point.service.spec.ts` -> 1 file / 4 tests, exit 0. One behaviour worth naming: unitStartPoint runs `git fetch` as a side effect of computing the start point, because merge-base needs the publication object present locally; it degrades to base when that fetch fails, so a forge hiccup cannot strand a unit. Non-goals respected: nothing brings the publication up to date with the integration branch (that stays the agent step), and a publication that has landed still starts at the base. Scope is the enter path only; no out-of-scope file changed.

## acceptance

- Entering a unit again to fix its open pull request gives a worktree that already holds the pull request's commits.
