---
id: x00895
title: "a unit entered again continues its open pull request"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-14
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

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/work-units/unit-start-point.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-start-point.service.spec.ts`
- **Gate**: type
- acceptance:
  - A work ref created by `work enter` whose publication branch exists on the integration remote, and is not an ancestor of the integration base, points at that publication's tip.
  - With no publication, or one that has landed, or a branch outside the work and publication prefixes, the work ref starts at the integration base, as before.
