---
id: x00717
title: "The review queue reaches the whole backlog"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00714]
last-transition-id: e9bcffd3-dabb-42b1-9f04-e5dff334b134
last-correlation-id: e9bcffd3-dabb-42b1-9f04-e5dff334b134
last-transition-from: review
shipped-in:
  - "6e7dec55f"
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

- `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`,
  `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`,
  `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/services/review-queue-page.service.ts`,
  `plugins/proposals/src/lib/tools/review-queue.tool.ts`,
  `generated/tool-outputs.ts`.

## Slices

- global_gate: none

### S1 — Paging and a per-reviewer start

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 6e7dec55f (x00717 S1, merge PR #587). fix(proposals): the review queue reaches the whole backlog. La cola de review lista TODAS las propuestas en review (no solo un subset visible). 10/10 verde entre review-queue-summary.service.spec + review-queue-swarm.tool.spec. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #587 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00717-S1-g1/every-reviewer-sees-the-whole-backlog (refs/heads/delendai/wip/claude-opus-5-5/implement/x00717-S1-g1/every-reviewer-sees-the-whole-backlog) (6e7dec55fc5b0e7cce59756154cf18a1176dbc0e), opened by minimax-m3

## dependency graph

None.

## acceptance

- With 83 proposals in review, `review_queue` returns ten and a `next`
  naming `offset: 10`. Following `next` reaches every proposal.
- A reviewer that names itself gets the free proposals rotated to its own
  start, and its pages still cover the backlog exactly once.
