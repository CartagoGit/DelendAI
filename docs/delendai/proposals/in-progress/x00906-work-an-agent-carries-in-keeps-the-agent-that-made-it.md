---
id: x00906
title: "Work an agent carries in keeps the agent that made it"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-16
---

# x00906 — Work an agent carries in keeps the agent that made it

## goal

When an agent hands in work another agent made (by adopting an idle unit and carrying its commits into one of its own), the review records the agent that made it as the implementer, so the independence a review rests on holds whoever carried the work; and a name that carries a proposal id is not taken for a model's.

## why

2026-10-15/16, while the session that made them was gone: `gpt-6` republished the commits of `claude-opus-5-5`'s x00905 unit in #1154 and submitted its four slices, so each round reads `review-implementer: gpt-6`; `codex-gpt-5` did the same with x00904 (#1153). Nothing in a commit says who made it (the Git author is the one machine owner every agent shares, and f00500 keeps model names out of commit messages), so the submitter's name was taken. With that record, `claude-opus-5-5` could have approved its own work as another's and every independence check would have passed.

Two agents also signed as `luna-x00885-s3` and `luna-x00885-s5`: the canon of x00901 S3 read `x00885` as a version.

## why this design

The commits do say where they were before: a work ref, a publication or a retired tip of the agent that made them, each named after its agent. A commit a submitter's unit holds was carried in when it is older than that unit and one other agent's refs hold it; work made in the unit after it was entered is the submitter's, whoever copied it since. That asymmetry needs no new record and no trailer in the history.

## non-goals

- Correcting rounds already landed by rewriting them: x00905's slices are submitted again by their maker, which the review tool records as a round.

## slices

- global_gate: type

### S1 — A submission of carried work names its maker

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/carried-work.service.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/services/carried-work.service.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-carried.spec.ts`
- **Gate**: type
- acceptance:
  - `proposal_review submit` in a unit whose every commit (the tool's own bookkeeping aside) predates the unit and is held by one other agent's work, publication or retired refs records that agent as the implementer, and adds a round saying who carried it.
  - Work made in the unit after it was entered, work only the submitter's refs hold, and a unit with no known entry are the submitter's, as before.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — A name that carries a proposal id is no model's

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/work-units/agent-name-canon.service.ts`
  - `packages/core/src/lib/contracts/constants/agent-name-canon.constant.ts`
  - `packages/core/tests/src/lib/work-units/agent-name-canon.service.spec.ts`
- **Gate**: type
- acceptance:
  - `work enter` refuses a name with a part shaped like a proposal id (`luna-x00885-s5`), saying a unit says what it works on and the name says who the agent is; a version part has at most four digits before its first dot.

## acceptance

- A slice handed in by an agent that carried another's work names the agent that made it, and that agent cannot approve it.
