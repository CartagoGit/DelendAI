---
id: x00918
title: "A work plan states the work model it runs under"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-18
---

# x00918 — A work plan states the work model it runs under

## goal

`auto_work`'s plan tells the agent how work starts and how it lands under the project's development profile, from the renderer every other surface uses (`workModelSummary`, `packages/core/src/lib/development-policy/declare-workflow.ts`), so an agent that follows only the plan works the way the policy says.

## why

Called on this repository 2026-10-18 (`shared-checkout-pr`), `delendai_proposals_auto_work` returned twelve steps; none says to start with `delendai work enter` or to land by pull request into `develop`. The server instructions, the overview (`workModel`), the guard and the isolation rule all say both, each from `briefWorkModel`/`workModelSummary`; the plan is the one surface that does not, and it is the one an agent is told to follow step by step. An agent that does sees "Claim its files", "Implement exactly that slice", "Submit … for peer review", and edits the shared checkout, where delendai's writes are refused.

## non-goals

- Rewriting the plan's other steps.

## slices

- global_gate: type

### S1 — The plan names the work model

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`
- **Gate**: type
- acceptance:
  - "With a resolved development policy, the work plan's first step is the profile's one-line work model (`workModelSummary`), read from the policy, not written in the tool; without one the plan is as before. A spec holds both."

## acceptance

- An agent following only `auto_work` starts and lands work the way the policy says.
