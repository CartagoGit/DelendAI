---
id: x00830
title: "A pull request is titled by its work"
kind: fix
status: review
type: proposal
track: trust
date: 2026-10-01
priority: P2
related: [x00677]
last-transition-id: 5869e617-8997-45c8-ac26-3b5c3d0a7272
last-correlation-id: 5869e617-8997-45c8-ac26-3b5c3d0a7272
last-transition-from: in-progress
---

# x00830 — A pull request is titled by its work

## goal

A pull request opened by `work publish` is titled by the oldest commit that
delivers something, so a person or an agent reading the queue knows what
each one changes.

## why

On 2026-10-01 four open pull requests were titled
`chore(delendai): delendai_proposals_create_proposal` while carrying 14
commits and 60 files of release and policy work. The title was the unit's
oldest commit that was not a claim or a hand-off, and a unit that starts by
creating its proposal through the tool starts with that tool's own record.
Agents read titles to tell what another unit is doing; a generic one hides
it, which is part of how overlapping work went unnoticed.

## why this design

- Bookkeeping now also covers the records a tool commits for itself
  (`chore(delendai)`, `chore(proposals)`), regenerated files
  (`chore(generated)`) and merges.
- Among what remains, the first subject with a delivering conventional type
  (`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`,
  `revert`) is the title; failing that, the oldest remaining subject; failing
  that, the unit's own name.
- Merges are left out of the body's commit list.

## non-goals

- Renaming pull requests already open.

## Slices

- global_gate: none

### S1 — The title is the oldest delivering commit

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`
- **Files**:
  - `packages/core/src/lib/work-units/publication-pull-request.service.ts`
  - `packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`
- shipped-in: `fe8889c334e0`

## dependency graph

None.

## acceptance

- A unit whose oldest commit is a tool record and whose work is a `fix`
  opens a pull request titled by that `fix`.
