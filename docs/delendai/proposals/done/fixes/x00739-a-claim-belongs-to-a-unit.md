---
id: x00739
title: "A claim belongs to a unit"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P1
related: [x00737]
last-transition-id: 0a92b222-0b06-45df-b688-e294a8f1d886
last-correlation-id: 0a92b222-0b06-45df-b688-e294a8f1d886
last-transition-from: review
shipped-in:
  - "60cf44fb31f30d13c36d385edd746f7bef3814aa"
---

# x00739 — A claim belongs to a unit

## goal

Two instances of one model reviewing at once — two `minimax-m3` sessions,
each in its own review unit — never claim the same proposal. Both review and
publish through MCP alone, with no terminal.

## why

A probe drove the review flow through the MCP server only: a consumer
repository, two server processes, one model name. It found two defects.

- `review_claim` and `review_queue` told claims apart by agent name. The
  second instance saw the first one's claim as its own, claimed the same
  proposal, and both reviewed it. Same-model review (`reviewIndependence:
  instance`) makes this the normal case, not an edge.
- A verdict that reopened a proposal was never committed. The proposals
  tools rename a file to its canonical name (staged), and reopening then
  moves it to another stage. The canonical path was neither in HEAD nor
  in the index, and naming it made `git commit -- <paths>` refuse the whole
  commit. The unit's publish then stopped on "uncommitted changes" and left
  the worktree and the work ref behind.

## why this design

- A claim holder is `{agent, unit}`, where the unit is read from the claim's
  ref (`wip/` or `pr/`, the same `workRefFor` the rest of the engine uses).
  `review_claim` compares units: the caller's unit comes from its
  checkout's branch. The model name stays in the refusal text for people.
- `review_queue` takes an optional `unit`. Given one, a claim held by any
  other unit counts as someone else's, even under the same agent name.
  Without it, the queue compares agent names as before, so older callers
  keep working. The CLI `review next` passes its unit.
- The auto-commit names only paths that HEAD or the index still knows. A
  path created and removed in one call has nothing to commit.

## non-goals

- Telling apart two instances that share one unit's worktree. One unit is
  one reviewer.

## architecture

- `plugins/proposals/src/lib/services/review-claims.service.ts`,
  `review-queue.service.ts`, `tools/review-claim.tool.ts`,
  `tools/review-queue.tool.ts`.
- `packages/core/src/lib/shared/commit-call-writes.ts`.
- `packages/cli/src/commands/review.command.ts`.

## Slices

- global_gate: none

### S1 — Claims by unit, and verdicts that reopen are committed

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts plugins/proposals/tests/src/lib/tools/review-queue-swarm.tool.spec.ts packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/contracts/interfaces/review-claim-holder.interface.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/lib/services/review-claims.service.ts`
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/services/review-procedure.ts`
  - `plugins/proposals/src/lib/tools/review-claim.tool.ts`
  - `plugins/proposals/src/lib/tools/review-queue.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue-swarm.tool.spec.ts`
  - `packages/core/src/lib/shared/commit-call-writes.ts`
  - `packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`
  - `packages/cli/src/commands/review.command.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 60cf44fb3 (x00739 S1, merge PR #607). review-claims.service.ts añade unit-scoping: cada claim está atado a (unitId, agent, proposalId); una segunda instancia del mismo modelo en otra unidad ve su claim rechazado y la cola marca la propuesta como held. request_changes se commitea por unidad vía commit-call-writes.ts y libera el claim; al publicar la unidad se eliminan worktree + work ref. 26/26 verde en los 3 specs focalizados. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from commit 60cf44fb31f3 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00739-all-g1/a-claim-belongs-to-a-unit (60cf44fb31f30d13c36d385edd746f7bef3814aa), opened by minimax-m3

## dependency graph

None.

## acceptance

- Two instances of one model, each in its own review unit, over MCP only:
  the second one's claim on the first one's proposal is refused, and its
  queue shows that proposal as claimed.
- A `request_changes` verdict that reopens a proposal is committed to the
  unit, and both units publish, removing their worktrees and work refs.
