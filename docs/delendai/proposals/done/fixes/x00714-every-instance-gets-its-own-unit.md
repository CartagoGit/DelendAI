---
id: x00714
title: "Every instance gets its own unit"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00699, x00695, x00704]
last-transition-id: b7e0c9de-ae6b-48ce-b5a2-553b1bb50c07
last-correlation-id: b7e0c9de-ae6b-48ce-b5a2-553b1bb50c07
last-transition-from: in-progress
---

# x00714 — Every instance gets its own unit

## goal

Twenty instances of one model are twenty units of work: each has its own
branch, worktree, session and pull request. No instance ever works in or
publishes another's.

## why

The agent id names the model, not the instance. Driven in a consumer
repository on 2026-09-28 with two instances of one model entering a
review batch:

- The second created its branch, then failed with "Could not add a
  worktree … check that the path is free". The worktree directory was
  named after the model (`model-c-batch-all`), which the first instance
  held. The branch stayed behind, orphaned.
- x00699's session refusal fired only when both named the same topic, and
  told the second to use "a different `--topic`", which is the path that
  broke.
- A unit is its model, proposal, slice and generation (x00704), so two
  topics in one generation are one unit's two refs. `publish` without a
  generation defaulted to generation 1, which could be another
  instance's unit.

## why this design

- **The generation names the instance.** `work enter` without
  `--generation` takes the first generation no other session holds, so a
  second reviewer gets `batch-all-g2`, with its own worktree directory
  (`…-batch-all-g2`) and publication.
- **A proposal's slice is refused instead.** A second instance on the same
  slice would do the same work twice. It is told to take other work, or
  to pass `--generation` for a deliberate second attempt.
- **The session finds your unit.** `publish` and `checkpoint` look across
  generations and choose the one the caller's `--session` holds. With
  several and no session, they refuse and name them rather than guess.
- **No branch without its worktree.** A branch created for a worktree that
  could not be added is deleted.

## non-goals

- How an agent learns its session: `work enter` prints it, and
  `DELENDAI_SESSION_ID` carries it.

## architecture

- `packages/cli/src/commands/work.command.ts`: `chooseGeneration`,
  `sessionHolding`, `unitGeneration`; generation-open unit lookup;
  session-first `existingWorkRef` and `ambiguousUnit`; dir suffix;
  rollback.

## Slices

- global_gate: none

### S1 — One unit per instance

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`

## dependency graph

None.

## acceptance

- Three instances of one model entering a review batch get
  `batch-all-g1`, `-g2`, `-g3`, three worktrees and three sessions.
  The second publishes its `-g2` by session. Without a session the
  publish refuses and names the three. Driven for real in a consumer
  repository and specified.
- A second instance on an implementation slice is refused, and no branch
  is left behind.
