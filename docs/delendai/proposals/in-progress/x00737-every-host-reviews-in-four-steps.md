---
id: x00737
title: "Every host reviews in four steps"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-28
priority: P0
related: [x00727, x00736]
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
  `contracts/constants/review-claim-schema.constant.ts` (new), registered in
  `src/index.ts`, disclosure in `surface/disclosure.ts`.
- `plugins/proposals/src/lib/services/review-procedure.ts`.
- `packages/cli/src/commands/review.command.ts`.

## Slices

- global_gate: none

### S1 — review_claim, and one way to claim

- **Status**: in-progress
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

## dependency graph

None.

## acceptance

- `review_claim { proposalId, agent, checkout }` makes one claim commit in
  the unit; a second call makes none; a proposal another reviewer holds is
  refused, naming them.
- `delendai review next` claims through it.
