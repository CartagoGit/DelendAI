---
id: x00727
title: "A review is four commands"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00714, x00717, x00718, x00722]
last-transition-id: 4886e74e-d395-4574-910e-0c216fb349a9
last-correlation-id: 4886e74e-d395-4574-910e-0c216fb349a9
last-transition-from: in-progress
---

# x00727 — A review is four commands

## goal

Reviewing a proposal takes four commands, whatever model runs them:
`delendai review next`, then `approve` or `changes` for each slice, then
`finish`. The reviewer reads and judges; delendai does the rest.

## why

Reviewing is reading what a proposal delivered and saying whether it holds.
On 2026-09-28 five instances of one model and one of another spent hours
failing at everything around that (the owner's log of it runs to 9,500
lines). They had to enter a review unit, find its worktree, claim each
proposal with a hand-written empty commit and trailer, pass the worktree
as `checkout` on every call, commit after each verdict, and publish once.
They skipped steps, wrote in the shared checkout, named themselves
inconsistently, collided on the same proposals and closed proposals they
had not reviewed.

## why this design

- **Four commands over what exists.** The unit is `work enter` / `work
  publish` on the review batch (`--kind=review --proposal=batch
  --slice=all`). The claim is the commit with the `Claims:` trailer that
  `review_queue` reads. The verdict is `proposal_review` with the unit as
  `checkout`, which closes a proposal on its last approval and reopens it
  on a change request. x00722 commits what it wrote. Nothing decides
  anything new.
- **`next` resumes before it takes.** A proposal this unit claimed and did
  not finish comes back first; only then is the next free one claimed.
- **The session carries the instance.** `next` prints the session; every
  later command passes it, so two instances of one model keep their own
  units (x00714).
- **`next` says how to answer**: each slice to judge, its gate, files,
  acceptance and delivering commit, and the exact `approve` and `changes`
  commands.
- **One procedure.** `review_queue` serves the four commands as the
  procedure, and names the same steps for a host with no terminal.

## non-goals

- An MCP tool for entering and publishing units; every host the reviewers
  used has a terminal.
- Declaring `review`'s flags (x00721 adds declared flags; this lands
  independently of it).

## architecture

- `packages/cli/src/commands/review.command.ts` (new), registered lazily in
  `groups/core.ts`; `contracts/constants/review-command.constant.ts`.
- `packages/cli/src/commands/groups/proposals.ts`: `evidenceArgs` shared.
- `packages/cli/src/contracts/constants/help-translation.constant.ts`,
  `tools/scripts/lint/cli-ui-parity.map.json`.
- `plugins/proposals/src/lib/services/review-procedure.ts`.

## Slices

- global_gate: none

### S1 — next, approve, changes, finish

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/commands/review.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/review.command.ts`
  - `packages/cli/src/commands/review.command.spec.ts`
  - `packages/cli/src/contracts/constants/review-command.constant.ts`
  - `packages/cli/src/commands/groups/core.ts`
  - `packages/cli/src/commands/groups/core.spec.ts`
  - `packages/cli/src/commands/registry.spec.ts`
  - `packages/cli/src/commands/groups/proposals.ts`
  - `packages/cli/src/contracts/constants/help-translation.constant.ts`
  - `tools/scripts/lint/cli-ui-parity.map.json`
  - `plugins/proposals/src/lib/services/review-procedure.ts`

## dependency graph

None.

## acceptance

- `review next --agent=A` enters A's review unit, claims the first proposal
  nobody holds (a `Claims:` commit in the unit), and names each slice's
  approve and changes commands with A's session.
- A second `next` with that session returns the same unit and the proposal
  it claimed, until none of its slices needs a verdict.
- `approve` and `changes` call `proposal_review` with the unit as
  `checkout`; `approve` passes the gate's exit code and test counts.
- `finish` publishes the unit through `work publish`.
