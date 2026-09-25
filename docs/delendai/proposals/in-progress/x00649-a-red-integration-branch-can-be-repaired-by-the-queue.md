---
id: x00649
title: "A red integration branch can be repaired by the queue"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
priority: P1
related: [x00636, x00637, x00647]
---

# x00649 — A red integration branch can be repaired by the queue

## goal

When the integration branch's certification is red, the queue lands the
candidate that repairs it without a person.

## why

On 2026-09-25 the certification of `develop` at `f99521d1b` failed on a
test with an expired date (x00647). The queue arms nothing while the
integration branch is not certified (x00637 S3), and that includes the
candidate that fixes it: #457 was green and level, and it sat waiting
for a manual merge. Every candidate behind it waited too. Head-only
hydration (x00636) meant nothing else moved either, so every open pull
request stayed behind for hours. Nothing woke the queue in the
meantime:

- `release-the-queue` runs only after a **green** certification.
- The hourly schedule runs `main`'s stale copy of the workflow, which
  fails before it does anything.

## why this design

The rule against arming on a red branch exists so that red does not
collect more merges before anyone sees it. A candidate is safe to land
on a red branch only if the branch it produces is green, and that can be
proven:

- A candidate level with the integration branch produces exactly its
  own tree.
- A **full** run on the candidate's head is the proof. A dispatched run
  is full; only `pull_request` runs use the `--changed` selection.

So, while the integration branch is red, the queue walks its order and,
for each level, non-conflicting candidate:

- a green full run: arm it;
- a full run in progress: wait for it;
- no full run: dispatch one. One is dispatched at a time, because red
  candidates are already out of the queue;
- a red full run: pass over it.

`release-the-queue` now wakes the queue after any non-PR run, red
certifications included, and after a dispatched full run on a
publication branch. It always runs the queue on the integration branch.

Head-only hydration stays as it is (decided 2026-09-25).

## non-goals

- Changing how a certified integration branch arms its head.
- Fixing the scheduled run on `main`. That is a promotion, and
  promotion is the owner's decision.

## architecture

- `tools/scripts/forge/queue-order.ts`: `repairStep`, a pure function
  with levelness and full-run state injected.
- `tools/scripts/forge/keep-the-queue-moving.script.ts`: on a red
  certification it computes the repair step, keeps the repairing
  candidate armed, arms it, or dispatches its full run. Levelness is read
  from `compare`'s `behind_by`, because `mergeable_state` never says
  `behind` when up-to-date is not required.
- `.github/workflows/ci.yml`: the `release-the-queue` condition and
  dispatch ref.

## Slices

- global_gate: none

### S1 — The queue lands the candidate proven to repair a red branch

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/forge/queue-order.spec.ts tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/queue-order.ts`
  - `tools/scripts/forge/queue-order.interface.ts`
  - `tools/scripts/forge/queue-order.spec.ts`
  - `tools/scripts/forge/keep-the-queue-moving.script.ts`
  - `.github/workflows/ci.yml`

## dependency graph

None.

## acceptance

- On a red integration branch, a level candidate whose full run is green
  is armed and not disarmed.
- A candidate whose full run is red is passed over. The next level
  candidate without a full run gets one dispatched, and only one run is
  dispatched at a time.
- A candidate that is behind, conflicting, red or a draft is never
  proposed.
- A red certification and a dispatched full run on a publication branch
  both wake the queue on the integration branch.

## risks and mitigations

- **A full run per repair attempt.** Only one runs at a time, and only
  while the integration branch is red.
- **A candidate that goes behind while its full run runs.** Levelness is
  asked again on every pass, so a candidate that went behind is not
  armed. If it merged anyway, the forge's merge would be a new tree,
  which the integration branch's own certification then judges.

## notes

- The effect reaches a candidate once it carries this `ci.yml`. A
  dispatch runs the workflow at the ref it names.
- `headBehind` in `keep-the-queue-moving` reads `mergeable_state ===
  'behind'`, which this repository's protection (`strict: false`) never
  produces. The owner machine brings the head forward anyway, so it does
  no harm, but it is a check that cannot fire.
