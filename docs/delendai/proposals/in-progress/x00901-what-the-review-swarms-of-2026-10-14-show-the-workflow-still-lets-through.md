---
id: x00901
title: "what the review swarms of 2026-10-14 show the workflow still lets through"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-14
---

# x00901 — what the review swarms of 2026-10-14 show the workflow still lets through

## goal

Every departure from the workflow that the owner's review swarms of 2026-10-14 make, over the 41 proposals in review, is written down here with its evidence, and its cause in the product is fixed so the next swarm, of any model, cannot repeat it.

## why

The owner, 2026-10-14: several swarms review the 41 proposals in review; watch them from time to time, find the mistakes they make, fix them at the root, and keep the findings in one proposal without stopping the rest of the work. An agent is not at fault for what the product lets it do: each finding names the rule the product should have enforced. The swarm of 2026-10-11 (x00880) is the baseline: what it fixed must not come back.

## non-goals

- Editing another agent's unit or verdicts: findings are fixed in the product, and a wrong verdict is corrected through its own reviewer's unit or retired.
- Judging the proposals under review myself.

## slices

- global_gate: type

### S1 — The findings, as they are observed

- **Status**: in-progress
- **Files**:
  - `docs/delendai/proposals/in-progress/x00901-what-the-review-swarms-of-2026-10-14-show-the-workflow-still-lets-through.md`
- **Gate**: type
- acceptance:
  - Each finding has its time, the agent and ref it was seen on, what the workflow expects, and the slice that fixes it, or why it needs none.
- roster (from the owner, 2026-10-14): two agents of each of minimax m3.1 review, glm 5.3 flash, qwen 3.8 flash, gpt 5.4, gemini 3.8 and luna 6.0 (luna is expected to do nothing: no quota left). Every ref's model segment is checked against these six.
- findings:
  - 2026-10-14 (start): no swarm ref on the forge yet; the only claim is `refs/delendai/claims/slice/f00763/all` (mine).
  - 2026-10-14 10:07: first ref is `delendai/wip/delendai-queue/review/batch-all-g4/close-approved-202610141007`, from the queue's own agent (`delendai-queue`), not from a reviewer.

## acceptance

- The findings of the 2026-10-14 swarms are recorded, and each one that has a product cause is fixed by a slice of this proposal.
