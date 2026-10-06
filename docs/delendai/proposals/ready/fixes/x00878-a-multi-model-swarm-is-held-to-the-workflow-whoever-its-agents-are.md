---
id: x00878
title: "A multi-model swarm is held to the workflow, whoever its agents are"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-06
---

# x00878 — A multi-model swarm is held to the workflow, whoever its agents are

## goal

Agents of several models and hosts working or reviewing at once (MiniMax M3.1, GLM, Luna, GPT-5.4, Claude) each sign as the model they are, write through the tools, and leave records the workflow can check; every departure observed in such a swarm becomes a gate or a fix.

## why

On 2026-10-06 the owner ran a review swarm on another host: several MiniMax M3.1 instances, GLM, Luna and GPT-5.4, alongside the Claude orchestrators of this repository. This proposal collects what such a swarm does that the workflow should not allow, as it is observed; each finding becomes a slice that fixes the product, not the agent. It is implemented once the swarm has finished.

### Findings log

- **2026-10-06 17:50, identities on the forge.** Review units appeared as `minimax-3` (two units), `minimax-m31`, `glm-5.3-flash` (four units, g1–g4), `gpt-5.4` and `illyria`. `minimax-3` names a family, not the model the agent runs (MiniMax M3.1, as the owner reports); `minimax-m31` is that model with its dot dropped, so the same model has two spellings; `illyria` is no model at all. Every one was accepted, and the name is now recorded as the reviewer in proposal documents (`review-reviewer: minimax-3` on x00752), which is where model independence (`reviewIndependence: model`) is judged.
- **2026-10-06 17:44, a verdict committed by hand.** `minimax-3` committed `chore(review): approve x00752 S1 — …`, moving the proposal to `done` with its review lines, under a message of its own instead of the review tool's record (`chore(delendai): delendai_proposals_proposal_review …`). Nothing distinguishes it from a verdict the tool checked.
- **2026-10-06 17:49, one agent, two spellings, two record shapes.** `gpt-5.4`'s unit recorded `review-reviewer: GPT-5.4` and `approved by GPT-5.4` (f00275): the ref and the document disagree on case. Its verdicts were committed under two subjects, `chore(delendai): delendai_proposals_proposal_review f00275 S1 approve` and `chore(delendai): delendai review approve f00275`; a check that tells a tool's record from a hand-written one needs one shape (or a trailer), not a subject that varies with the entry point.
- **2026-10-06, a `new` unit keeps its slot after it names its proposal.** Once `proposals create` turned `new/all` into x00877, the `new/all` reservation and the `claude-opus-5-5-new-all` directory still blocked the next new proposal: `work enter --proposal=new` was refused until given `--alongside` and `--dir`.

## non-goals

- Correcting an agent's behaviour by instruction alone: every finding is closed by a gate or a product change that holds for any model and host.
- Judging the quality of a verdict's reasoning: this is about records the workflow can check (who, through which tool, with which evidence).

## slices

- global_gate: none

### S1 — An agent signs with the model it runs as
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/agent-identity.service.ts`
- **Gate**: type
- acceptance:
  - "An identity that names no model (a persona such as `illyria`), or a family without its version (`minimax-3` for MiniMax M3.1), is refused at `work enter` and at every verdict, with the spelling the host reports for the model it runs."
  - "One model has one spelling everywhere: the ref segment, the verdict line and the review lines agree (`minimax-m3.1`, not `minimax-m31` in the ref and something else in the document)."

### S2 — A verdict reaches the document only through the review tool
- **Status**: pending
- **Files**: `tools/scripts/lint/review-lines-written-by-the-tool.script.ts`
- **Gate**: type
- acceptance:
  - "A commit that changes a slice's review lines or a proposal's status without the review tool's record (its commit, or its trailer) fails a gate, so a verdict written by hand cannot pass for one the tool checked."

### S3 — A created proposal releases the reservation and directory of its `new` unit
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/new-proposal-unit.service.ts`
- **Gate**: type
- acceptance:
  - "After `proposals create` names a `new` unit's proposal, the `new/all` reservation and the `<agent>-new-all` worktree directory are free: a second new proposal can be started without `--alongside` or `--dir`."

## acceptance

- An identity that names no model (a persona such as `illyria`), or a family without its version (`minimax-3` for MiniMax M3.1), is refused at `work enter` and at every verdict, with the spelling the host reports for the model it runs.
- One model has one spelling everywhere: the ref segment, the verdict line and the review lines agree (`minimax-m3.1`, not `minimax-m31` in the ref and something else in the document).
- A commit that changes a slice's review lines or a proposal's status without the review tool's record (its commit, or its trailer) fails a gate, so a verdict written by hand cannot pass for one the tool checked.
- After `proposals create` names a `new` unit's proposal, the `new/all` reservation and the `<agent>-new-all` worktree directory are free: a second new proposal can be started without `--alongside` or `--dir`.
