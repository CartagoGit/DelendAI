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

### S2 — A level head nobody armed asks the queue to run

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`

Observed the same day, after the host-server restart: develop was
certified, the head (#429) was level and green, and nothing was armed for
over an hour. The queue job runs when the integration branch moves or is
certified; the hydrator asked it to run only after bringing a candidate
forward itself. A head made level any other way (by its author, or by a
pass whose dispatch failed) waited for the hourly schedule, which runs
main's stale workflow and fails. The hydrator now also asks when the head
is level and not armed (`shouldAskQueueToRun`); the queue job is
idempotent and still arms only on a certified integration branch.

### S3 — A stacked work ref is not reported as published

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Files**: `tools/scripts/lint/ref-lifecycle-guard.script.ts`,
  `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`

Observed the same day: develop's certification run at `a2d424a9c` went
red on `ref-lifecycle` alone, and the queue stopped behind it. A work ref
entered on top of another unit's publication (stacking, which this
proposal's own S2 did) starts at that publication's tip, so it is
contained in it; the guard counted any containing publication as where
the work was published and reported the fresh ref as a stale copy,
failing every run that looked while the unit was open. A work ref now
counts as published only in its own unit's publication: the same model,
proposal and generation, and the same slice or the whole proposal. The
integration branch and names outside the convention keep the plain
containment rule. The red certification was re-run in full once the ref
was gone.

### S4 — A refused push says why, and does not hold the queue

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`

Observed after S1 landed: the hydrator merged and regenerated #434 and
logged `failed: push refused` on every pass, with nothing else; the same
merge pushed by hand went through. The refusal now carries the lines the
hook or the remote marked as failing (`pushRefusalReason`), and a
candidate that could not be brought forward for any reason (an authored
conflict, a failed generator, a refused push) is passed over instead of
being retried while every candidate behind it waits.

### S5 — Every AGENT.md is written after the dashboard it quotes

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/gen-all.spec.ts`
- **Files**: `tools/scripts/gen-all.script.ts`, `tools/scripts/gen-all.spec.ts`

The push S4 made legible failed CI's `drift` job on
`packages/core/AGENT.md`. Every AGENT.md quotes its token hotspots from
`TOKEN-BUDGETS.md`, and `gen:all` wrote AGENT.md before regenerating the
dashboard, so a change that moved a tool's size left each AGENT.md one
measurement behind; the drift check, which re-derives AGENT.md from the
committed dashboard, then failed a push that had just regenerated
everything — the hydrator's included. `agent-md` now runs after
`token-budget-dashboard`, and a spec pins that dependency.

## dependency graph

S2 builds on S1's queue order; S3 is independent. It relies on f00552's declarations being
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
