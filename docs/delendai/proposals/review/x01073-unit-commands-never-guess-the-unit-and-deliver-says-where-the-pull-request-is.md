---
id: x01073
title: "Unit commands never guess the unit, and deliver says where the pull request is"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-15
last-transition-id: c568c88b-b4b8-4e33-82f5-4517402c7dca
last-correlation-id: c568c88b-b4b8-4e33-82f5-4517402c7dca
last-transition-from: in-progress
last-transition-at: 2026-11-15T22:32:46.732Z
---

# x01073 — Unit commands never guess the unit, and deliver says where the pull request is

## goal

A unit command run outside the unit's worktree never guesses its slice: `work deliver` with no unit flag and no unit in cwd finds the agent's one live unit of that proposal, or refuses listing the candidates with the exact command. A publication carries the slice of the unit it publishes, never `all` by default. `work enter` on a proposal in review with an implement slice and no `--kind` does not hand out a review unit. `work deliver` answers with the pull request number and URL, or says the publication was pushed and the pull request is pending, with the branch.

## why

Observed 2026-11-15 with three agents. Outside the worktree `work deliver` assumed slice `all` and failed with 'refs/heads/...-all-g1/work resolves to no commit'. A delivery from an S1 unit published `.../implement/x01071-all-g1/work` instead of `-S1-g1`. `work enter --slice=S12 --generation=3` on a proposal in review returned exit 0 and a review unit, where the agent worked until the commit guard refused. `work deliver` printed no pull request URL and agents could not find their pull request. Each is a command guessing instead of resolving or refusing, so each is fixed in product code.

## non-goals

- Changing the work ref template or the names of existing refs.
- Changing how pull requests are opened or merged.
- Changing the review swarm or the verdict flow.
- Resolving units of other agents.

## slices

- global_gate: none

### S1 — Deliver outside the worktree finds the agent's one live unit or refuses
- **Status**: review
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/cli/src/lib/work-live-unit.service.ts`, `packages/cli/src/lib/work-live-unit.service.spec.ts`
- **Gate**: none
- acceptance:
  - "When work deliver has no unit flag and cwd holds no unit, it looks up the agent's live units of that proposal and uses the only one."
  - "With none or several it refuses, lists them and prints the exact command; it never falls back to slice all."
  - "A spec proves the one, none and several cases."
- shipped-in: `7a4c3fc74448`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — A publication carries the unit's slice
- **Status**: review
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`
- **Gate**: none
- acceptance:
  - "The publication started by the review transition of a deliver names the slice of the unit, not all."
  - "The cause of the lost slice is stated in the commit body."
  - "A spec proves a unit of S1 on a branch named all reports slice S1 and the note."
- shipped-in: `7a4c3fc74448`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Enter with an implement slice and no kind never hands out a review unit
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/review-kind.service.ts`, `packages/core/tests/src/lib/work-units/review-kind.service.spec.ts`
- **Gate**: none
- acceptance:
  - "work enter with an implement slice and no --kind on a proposal in review follows the documented reopen rule or refuses naming --kind=implement and --kind=review."
  - "The commit body states which of the two was chosen and why."
  - "A spec proves no review unit is returned."
- shipped-in: `7a4c3fc74448`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S4 — Deliver says where the pull request is
- **Status**: review
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`
- **Gate**: none
- acceptance:
  - "The deliver result includes the pull request number and URL, or states publication pushed, pull request pending, with the branch."
  - "A spec proves both outputs."
- shipped-in: `7a4c3fc74448`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S5 — A small fix travels with its proposal in one unit and one pull request
- **Status**: review
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/core/src/lib/work-units/outside-slice.service.ts`, `plugins/proposals/src/lib/tools/proposal-publish-next-action.ts`, `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`
- **Gate**: none
- acceptance:
  - "work deliver and prove --locate find a create-kind unit: the unit flags of the checked-out branch carry its kind."
  - "The outside-slice report covers create units."
  - "The skill and the publish next-action say a small fix may be delivered from the create unit."
- shipped-in: `18990d7333dd`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- When work deliver has no unit flag and cwd holds no unit, it looks up the agent's live units of that proposal and uses the only one.
- With none or several it refuses, lists them and prints the exact command; it never falls back to slice all.
- A spec proves the one, none and several cases.
- The deliver result names the unit's slice next to a publication branch that says all, and explains that the policy publishes a small proposal whole.
- The cause is stated in the commit body: a proposal small enough is published whole by integration.publication, so its branch says all; the work ref keeps the slice.
- A spec proves a unit of S1 on a branch named all reports slice S1 and the note.
- work enter with an implement slice and no --kind on a proposal in review follows the documented reopen rule or refuses naming --kind=implement and --kind=review.
- The commit body states which of the two was chosen and why.
- A spec proves no review unit is returned.
- The deliver result includes the pull request number and URL, or states publication pushed, pull request pending, with the branch.
- A spec proves both outputs.
- work deliver and prove --locate find a create-kind unit, and the outside-slice report covers create units.
- The skill text and the publish next-action say a small fix may be delivered from the create unit.
