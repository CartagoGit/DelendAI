---
id: x00642
title: "A conflict in a derived file does not stall the queue"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
priority: P0
related: [x00554, x00565, x00637, f00552]
---

# x00642 — A conflict in a derived file does not stall the queue

## goal

Candidates keep moving into the integration branch after a merge without
an agent or a person merging the integration branch into them by hand.

## why

Observed on 2026-09-25, and raised by the owner: many green pull requests
sat unmerged and "were not rehydrating by themselves". The owner-machine
hydrator was running (its log shows it bringing candidates forward), yet
it kept reporting `head of the queue (none)` while about ten candidates
were open.

Every merge rewrites the same generated files (`TOKEN-BUDGETS.md`,
`preset-metadata.generated.ts`, the agent catalog). So after one merge,
nearly every other candidate conflicts with the integration branch in
exactly those files. Two rules then combined into a deadlock:

- `queueHead` passed over every conflicting candidate ("only its author
  can resolve that"), so with all of them conflicting there was no head;
- `refreshCandidate` only ever brought the head forward, and gave up on
  any textual conflict ("its author decides").

The hydrator already regenerates derived files after its merge; a
conflict confined to them is thrown away by that step, so it was never a
decision about intent. An agent resolving it by hand every time was
doing the machine's job.

## why this design

- **What counts as derived is declared, not listed again.** f00552's
  declarations name every projection this repository rebuilds with
  `gen:all` (`AUTHORITIES.md`). Those, and only those, may be taken from
  the integration branch in a conflict; the refresh runs `gen:all` right
  after. A conflict that reaches any other file is still left to its
  author, untouched.
- **One order, two uses.** `queueOrder` is the queue: ready, not red,
  oldest first, conflicting ones included. `queueHead` (what the forge job
  arms) is its first candidate that does not conflict. The hydrator walks
  the same order and brings forward the first candidate it can, passing
  over one whose conflict is authored, instead of stalling behind it.

## non-goals

- Resolving authored conflicts. They stay with the author.
- Undeclared generated files (`packages/core/AGENT.md`,
  `src/generated/tool-outputs.ts`): a conflict there still stops the
  refresh. Declaring them as projections is what extends this.

## architecture

- `tools/scripts/forge/queue-order.ts`: `queueOrder`; `queueHead` derived
  from it.
- `tools/scripts/forge/keep-the-queue-moving.script.ts`:
  `currentQueueOrderBranches`.
- `tools/scripts/git/refresh-candidate-artifacts.constant.ts`:
  `REGENERATED_PROJECTIONS` from `REPO_AUTHORITIES`.
- `tools/scripts/git/refresh-candidate-artifacts.script.ts`: a conflict
  confined to regenerated files takes the integration side and continues
  to `gen:all`; the main loop walks the queue order.

## Slices

- global_gate: none

### S1 — Derived conflicts are resolved and the hydrator walks the queue

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/git/refresh-candidate-artifacts.script.spec.ts tools/scripts/forge/queue-order.spec.ts`
- **Files**: `tools/scripts/forge/queue-order.ts`,
  `tools/scripts/forge/queue-order.spec.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.constant.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`

## dependency graph

None within the proposal. It relies on f00552's declarations being
complete for the files it resolves.

## acceptance

- A candidate that conflicts with the integration branch only in declared
  projections is merged, regenerated and pushed by the hydrator.
- A conflict reaching any other file leaves the candidate untouched, and
  the hydrator moves on to the next candidate in the queue.
- The forge-side head is the first non-conflicting candidate of the same
  order the hydrator walks.

## risks and mitigations

- **A projection whose generator does not run in `gen:all`.** Only
  declarations whose rebuild is `bun run gen:all` are used; the drift
  gates still check the pushed result.

## notes

Until this lands, a stalled queue is unblocked by merging the integration
branch into its oldest candidate and regenerating, which is what agents
had been doing by hand.
