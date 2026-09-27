---
id: x00673
title: "The review queue is a compact list"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00646, f00644]
last-transition-id: 8caf1d0f-27da-4bc6-b33a-1848f51e1e39
last-correlation-id: 8caf1d0f-27da-4bc6-b33a-1848f51e1e39
last-transition-from: in-progress
---

# x00673 — The review queue is a compact list

## goal

`review_queue` without `proposalId` lists each proposal's slices by
state, plus its `claim` or `close`. The evidence a reviewer judges comes
back for the proposal it asks for (`proposalId`), or on explicit
`detail: true`.

## why

On 2026-09-26 one `review_queue` call with `limit: 40` returned 624 KB.
Every slice carried its delivery candidates (133 KB across the page),
later commits (65 KB), files, acceptance and next action, and the MCP
answer carries the payload twice. A reviewer choosing what to claim spent
its context on 39 proposals it was not going to review. The audit ranks
tokens and context as the project's weakest area.

## why this design

- **The list is for choosing.** A slice shows its id, title, status,
  review state and verdict, and what is missing when it is blocked.
  Each proposal keeps its `claim` or `close`.
- **The evidence is for judging.** It comes back unchanged for the
  proposal a reviewer asks for by `proposalId`, which the procedure now
  tells it to do once it has claimed a proposal. `detail: true` returns
  it for the whole page, for tools that need it.
- **The schema says so.** `candidates`, `files`, `acceptance` and
  `nextAction` become optional in the output schema: absent from the
  list, present in the detail.

## non-goals

- Removing the payload's duplicate in the MCP text channel. That is
  every tool's concern, not this one's.

## architecture

- `plugins/proposals/src/lib/services/review-queue-view.service.ts`:
  `compactQueue`.
- `review-queue.tool.ts`: chooses the view; the input schema gains
  `detail`.

## Slices

- global_gate: none

### S1 — List by default, evidence on request

- **Status**: done (git log: 7828a786b Merge pull request #506 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00673-all-g1/the-review-queue-is-a-compact-list)
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-queue-view.spec.ts plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue-view.service.ts`
  - `plugins/proposals/src/lib/tools/review-queue.tool.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/lib/services/review-procedure.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue-view.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue-candidates.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- Without `proposalId`, no slice carries candidates, files, acceptance,
  next action or later commits; each carries its verdict.
- With `proposalId`, the slice carries its full evidence.
- The procedure tells the reviewer to ask for the claimed proposal by
  `proposalId`.
