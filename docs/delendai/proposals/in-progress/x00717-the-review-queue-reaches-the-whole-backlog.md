---
id: x00717
title: "The review queue reaches the whole backlog"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00714]
---

# x00717 — The review queue reaches the whole backlog

## goal

A reviewer can reach every proposal waiting for review, and reviewers
started together do not all pick the same one.

## why

On 2026-09-28 six reviewers (five instances of one model, one of another)
called `review_queue` together. Each got the same ten oldest proposals of
83. The output said "10 of 83" and offered no way to see the rest: no
`offset`, no next step. All six took the first free one and collided on
it; a claim only shows once its unit exists, so they could not see each
other in time. The other 73 went unseen.

## why this design

- **Paging, with the next call named.** `offset` input, and a `page`
  (`offset`, `returned`, `total`, `next`) in the output. `next` is the
  exact call for the following page, with the reviewer's `agent`.
- **Each reviewer starts at its own point.** A reviewer that names itself
  gets the free proposals rotated by a hash of its process and name:
  stable for the life of its server, so its pages stay consistent, and
  different between the servers a swarm runs. Claimed proposals still
  come last. A call without `agent`, or for one `proposalId`, reads the
  backlog oldest first, as before.

## non-goals

- Making claims atomic. Rotation makes a collision unlikely; the claim
  (the reviewer's unit ref) still decides who holds a proposal.

## architecture

- `contracts/constants/review-queue-schema.constant.ts`,
  `contracts/interfaces/review-queue.interface.ts`,
  `services/review-queue.service.ts`, `services/review-queue-page.service.ts`,
  `tools/review-queue.tool.ts`,
  `generated/tool-outputs.ts`.

## Slices

- global_gate: none

### S1 — Paging and a per-reviewer start

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/services/review-queue-page.service.ts`
  - `plugins/proposals/src/lib/tools/review-queue.tool.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue-swarm.tool.spec.ts`

## dependency graph

None.

## acceptance

- With 83 proposals in review, `review_queue` returns ten and a `next`
  naming `offset: 10`. Following `next` reaches every proposal.
- A reviewer that names itself gets the free proposals rotated to its own
  start, and its pages still cover the backlog exactly once.
