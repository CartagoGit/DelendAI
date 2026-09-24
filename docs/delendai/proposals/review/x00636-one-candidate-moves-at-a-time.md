---
id: x00636
title: "One candidate moves at a time"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-24
---

# x00636 — One candidate moves at a time

## goal

Open pull requests stop accumulating merges of the integration branch.
One candidate at a time is brought up to it, validated against it and
merged; the others wait untouched.

## why

Reported by the project owner on 2026-09-24: the history looked like a
maze rather than a normal flow. Measured over the previous 24 hours on
`develop`: 43 pull-request merges, 67 authored commits and **68**
`Merge develop into <candidate>` commits. Every time the integration
branch moved, every open candidate was brought forward, and the next
merge made each of those merges obsolete.

The hydration exists for a real reason: `develop` does not require a
candidate to be up to date (`strict: false`), so without it a candidate
merges on a green check computed against an integration branch that has
since moved. The forge's merge queue solves exactly this, but it is not
available to a repository owned by a personal account.

## why this design

- `queueHead` decides the head: the oldest candidate under the
  publication namespace that is not a draft, not red and not
  conflicting. It is the one definition, used by both writers.
- `keep-the-queue-moving` (CI) arms only the head, and only when it is
  level with the integration branch; it disarms any other candidate
  still armed, since that one could merge on a stale green.
- The owner machine's hydrator brings only the head forward (merge,
  install, `gen:all`, push) and asks the queue to run, which then arms
  it. The rest are not written to until they reach the head.
- Cost, stated: merges become sequential, one CI run per candidate at
  the head. In exchange every candidate is validated against the
  integration branch it actually lands on, and each carries at most the
  one merge that brought it forward.

## non-goals

- Resolving conflicts: a conflicting candidate is skipped and reported.

## Slices

- global_gate: none

### S1 — The queue has a head, and only the head moves

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/queue-order.spec.ts`
- **Files**: `tools/scripts/forge/queue-order.ts`,
  `tools/scripts/forge/queue-order.interface.ts`,
  `tools/scripts/forge/queue-order.spec.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.ts`

### S2 — One hydration at a time

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/git/hydration-lock.spec.ts`
- **Files**: `tools/scripts/git/hydration-lock.ts`,
  `tools/scripts/git/hydration-lock.spec.ts`,
  `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- Seen on the first day of S1: the post-merge hook fired twice within
  seconds, so two background runs brought the same head forward in
  parallel; one pushed, the other was refused, and both asked the queue
  to run. A lock under `.cache/delendai` lets one run in; a second leaves
  a note and steps aside, and the holder goes round again for it. A lock
  whose holder process is gone is taken over.

## acceptance

- After a merge into the integration branch, exactly one candidate
  receives a merge of it, and only if it is behind.
