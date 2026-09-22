---
id: x00599
title: "A moved proposal is counted once, and reported as a move"
kind: fix
status: review
type: proposal
track: proposals
date: 2026-09-22
tags:
    - sqlite
    - reconciler
---

# x00599 — A moved proposal is counted once, and reported as a move

## goal

The reconciler says how many files moved, and says it correctly.

## why

Reported as a small thing:

> This variable `relocated` is unused
> — `packages/proposals-sqlite/src/lib/reconciler-staging.ts:283`

It is assigned from `reconcileTombstones` and never read. A variable in
that shape reads like a term somebody forgot to add to `filesChanged`,
and that is the first thing an agent will "fix".

It would be wrong. `countAgainstAuthority` compares a content digest
that **includes `source_path`**, so an entity whose file moved already
differs from the authority and is already counted as an update. Adding
`relocated` to `filesChanged` counts the same move twice.

Measured, not reasoned about: seeding one proposal at
`ready/fixes/x00001.md`, reconciling a tree that holds it at
`ready/refactors/x00001.md`, and reading the run row back gives
`files_changed: 1, entities_created: 0, entities_updated: 1,
entities_deleted: 0`.

**But the counter itself was wrong**, and that only showed up once there
was a test. `relocated` came back `0` for that move.

There are two ways an entity's path can change, and the loop handles
them in two branches:

- the entity is **still projected** — same id, new path, nothing
  disappeared. This is the ordinary case: somebody moved a file and it
  still parses. The branch writes `path_history` and `continue`s.
- the entity **vanished** from the tree and `classifyDisappearance`
  matched it back by basename. The rare case. This branch writes
  `path_history`, counts `relocated += 1`, and `continue`s.

So the counter reported only the rare half. A reorganisation that moves
two hundred files — every one of them still parsing — reported zero
relocations.

## non-goals

- Adding `relocated` to `filesChanged`. It is a breakdown of
  `entitiesUpdated`, not an addition to it.

## architecture

One rule for both branches: **if the path changed, it moved.** The first
branch counts it too, guarded by the same `pathChanged` the second one
uses, so the counter and the path history can no longer disagree —
they were already meant to be written together.

`relocated` then leaves the function it is computed in:
`IReconcileShadowResult` gains it, with the reason it is not an addend
written where the next reader will find it. A reorganisation that moves
two hundred files is otherwise indistinguishable from two hundred edits,
and the two want very different reactions.

## slices

### S1 — count every move, and report it

- **Status**: review
- **Files**: [`packages/proposals-sqlite/src/lib/reconciler-tombstone.ts`, `packages/proposals-sqlite/src/lib/reconciler-staging.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-tombstone.spec.ts`]
- **Gate**: `bun test --timeout 30000 packages/proposals-sqlite/`

## acceptance

- A proposal whose file moved, and which still projects, reports
  `relocated: 1`.
- The same run's row reads `files_changed: 1, entities_created: 0,
  entities_updated: 1, entities_deleted: 0` — the move counted once.
- A proposal edited where it stands reports `relocated: 0`.
- 188 proposals-sqlite tests pass.

## risks and mitigations

- **A caller adding `relocated` to a total.** The field's own
  documentation says it is a breakdown and not an addend, and the test
  that pins `files_changed: 1` fails if anyone makes it one.

## notes

The original diagnosis of this variable — mine — was that it was a
missing term in `filesChanged`. It was not, and a draft that "fixed" it
that way would have introduced a double count while looking like a
tidy-up. The test came first this time, and it said something different
from what the code looked like it said.
