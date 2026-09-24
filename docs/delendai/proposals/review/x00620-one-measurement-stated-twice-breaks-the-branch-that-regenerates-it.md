---
id: x00620
title: "One measurement stated twice breaks the branch that regenerates it"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
---

# x00620 — One measurement stated twice breaks the branch that regenerates it

## goal

The catalog's wire cost is measured by one script. It should be recorded
in one place. Today it is recorded in two — the generated dashboard and a
hand-written literal inside the spec that guards it — and the second copy
has to be edited by hand every time the first is regenerated.

## why

Observed, and caused by me. A proposal that changed one skill's
`appliesTo` declaration moved the catalog by two bytes. `gen:all`
rewrote `docs/delendai/TOKEN-BUDGETS.md`, the PR was green on its own
branch, and the merge broke `develop`: the spec still asserted the old
figure. The same thing happened again one branch later, when adding an
argument to two tools moved the swarm preset by 319 bytes.

The spec was right to fail. What was wrong is that there were two places
to change, only one of which any tool regenerates, so the second is only
ever found by a red build — and a red build on the integration branch,
because nothing about the stale literal is visible on the branch that
staled it until it merges with someone else's regeneration.

This is the shape the repository already refuses everywhere else: two
statements of one fact, one of them generated, and a human expected to
keep them equal.

## why this design

The script's output is already embedded in the dashboard verbatim, so the
spec can assert exactly that — the doc contains what the script prints —
and the numbers exist once, in the generated file.

The ratchet is not weakened, which is the only reason this spec exists.
`gen:all` writes the dashboard and `drift-check` refuses a push whose
generated files are stale, so a surface change still has to be
regenerated deliberately and still lands in the diff as the byte figures
it is. The historical ledger of *why* each figure moved is kept in the
spec, because a regenerated table cannot carry a reason.

What the ratchet loses is the ability to notice a change that is
regenerated in the same commit without anyone reading it. It never had
that ability: a hand-edited literal is changed by the same person, in the
same commit, with the same amount of thought.

## non-goals

- Changing what the measurement measures, or any budget ceiling.
- Removing the ledger comments. They are the part worth keeping.

## Slices

- global_gate: none

### S1 — The figures live in the generated file only

- **Status**: done — proved in both directions: with the dashboard
  reverted to its committed state the spec fails; regenerated, it passes.
- **Gate**: `npx vitest run packages/core/tests/src/lib/token/catalog-task-context-cost.spec.ts`
- **Files**: `packages/core/tests/src/lib/token/catalog-task-context-cost.spec.ts`
- The spec asserts `docs/delendai/TOKEN-BUDGETS.md` contains the
  measurement script's output, instead of restating nine figures from it.
  The corpus-label assertions stay, because they are about the corpus
  being measured at all rather than about its size.

## acceptance

- Regenerating the dashboard after a surface change is the only edit
  needed; no literal has to be kept equal by hand.
- A stale dashboard still fails the spec.
- The ledger of reasons is still in the spec.
