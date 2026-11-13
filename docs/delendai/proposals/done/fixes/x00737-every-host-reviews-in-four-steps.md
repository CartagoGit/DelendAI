---
id: x00737
title: "Every host reviews in four steps"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P0
related: [x00727, x00736]
last-transition-id: 8d3b1992-4b88-44b9-a5d8-31fb9ebfc295
last-correlation-id: 8d3b1992-4b88-44b9-a5d8-31fb9ebfc295
last-transition-from: review
shipped-in:
  - "808e014eb"
---

# x00737 — Every host reviews in four steps

## goal

A host with MCP and no terminal reviews a proposal end to end: enter its
review unit, claim a proposal, record verdicts, publish. A claim is made
one way, whether a terminal or MCP makes it.

## why

After x00736 an MCP-only host can enter and publish a unit with the `work`
tool, read the queue and record verdicts. Claiming a proposal before
reading it was the one step left that only `git` could do: an empty commit
with the `Claims` trailer `review_queue` reads. Without it, two reviewers
could read the same proposal, and the owner could not see who was on what.

## why this design

- **`review_claim`**, a proposals tool (`caller-checkout`): the claim commit
  in the reviewer's unit. It refuses a proposal another reviewer holds and
  does not claim twice what the unit already claimed.
- **`delendai review next` claims through it**, so the terminal and MCP make
  the same commit.
- **`review_queue`'s procedure names the MCP path**: the `work` tool to enter
  and publish, `review_claim`, `proposal_review` with the unit as
  `checkout`.

## non-goals

- Moving the rest of `delendai review` into a tool: its steps are these
  tools, in order.

## architecture

- `plugins/proposals/src/lib/tools/review-claim.tool.ts` (new),
  `plugins/proposals/src/lib/contracts/constants/review-claim-schema.constant.ts` (new), registered in
  `src/index.ts`, disclosure in `surface/disclosure.ts`.
- `plugins/proposals/src/lib/services/review-procedure.ts`.
- `packages/cli/src/commands/review.command.ts`.

## Slices

- global_gate: none

### S1 — review_claim, and one way to claim

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts packages/cli/src/commands/review.command.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/tools/review-claim.tool.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-claim-schema.constant.ts`
  - `plugins/proposals/src/index.ts`
  - `plugins/proposals/src/lib/surface/disclosure.ts`
  - `plugins/proposals/src/lib/services/review-procedure.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/plugin.spec.ts`
  - `packages/cli/src/commands/review.command.ts`
  - `packages/cli/src/commands/review.command.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 808e014eb (x00737 S1, merge PR #605). fix(proposals): every host reviews in four steps. El flujo de review es idéntico en todos los hosts (entrar/claim/approve-or-changes/finish). 15/15 verde en reconcile-before-dispatch.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #605 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00737-S1-g1/every-host-reviews-in-four-steps (refs/heads/delendai/wip/claude-opus-5-5/implement/x00737-S1-g1/every-host-reviews-in-four-steps) (808e014eb460cdcce422d2bc80e0850754c64d2b), opened by minimax-m3

## dependency graph

None.

## acceptance

- `review_claim { proposalId, agent, checkout }` makes one claim commit in
  the unit; a second call makes none; a proposal another reviewer holds is
  refused, naming them.
- `delendai review next` claims through it.
