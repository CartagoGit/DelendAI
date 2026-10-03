---
id: x00831
title: "A slice held by another agent is not entered by accident"
kind: fix
status: review
type: proposal
track: trust
date: 2026-10-01
priority: P1
related: [x00714, x00791]
last-transition-id: 57a9264e-1876-4ae3-b406-a406b164fd92
last-correlation-id: 57a9264e-1876-4ae3-b406-a406b164fd92
last-transition-from: in-progress
---

# x00831 — A slice held by another agent is not entered by accident

## goal

`work enter` refuses a proposal slice that another agent already holds, and
names who holds it and what can be done, so two agents do not do the same
work and then collide when it lands.

## why

`work enter` refused a second session of the same agent on a slice
(x00714), and nothing else. On 2026-10-01 two orchestrators each ran
subagents on this repository: a slice was published under three
generations at once, a unit was built on another's unlanded commits, and
two agents entered the same proposal from different sessions. Each unit
spent CI rounds, refreshes and merges on work another unit was already
doing. The swarm view knew all of it (x00791); `enter`, the moment that
decides, never asked.

## why this design

- A slice is held by another agent's live work ref or by a publication of
  theirs that has not landed. A unit for `all` holds every slice of its
  proposal, and any slice holds `all`.
- The agent's own units never block it: re-entering your own unit is how
  you finish it.
- Review units read work instead of doing it, so they neither hold a slice
  nor are kept out of one.
- The refusal names the holder's ref and four answers: wait, take other
  work, take it over with `work claim`, or `--alongside` for a deliberate
  second attempt, as `--generation` already allows within one agent.

## non-goals

- Who owns a unit and whether it is still alive: that is the lease and
  liveness work of the other orchestrator, which this reads nothing from.
- Comparing the files a slice declares: the core does not read proposals.

## Slices

- global_gate: none

### S1 — `work enter` refuses a slice another agent holds

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/slice-holders.service.spec.ts`
- **Files**:
  - `packages/core/src/lib/work-units/slice-holders.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/cli/src/contracts/constants/work-command.constant.ts`
  - `packages/core/tests/src/lib/work-units/slice-holders.service.spec.ts`
- shipped-in: `8acb6c0369b1`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — x00831 S1 - work enter refuses a slice another agent holds and names the holder + escape routes. commit 8acb6c0369b1dba067808d11e16f3235ff5d1809 introduces packages/core/src/lib/work-units/slice-holders.service.ts (the holdersOfSlice resolver) and rewires work-unit-enter.service.ts to read it before claiming. Update to work-command.constant.ts documents the refusal error shape. The four named exits are present (wait, take other work, work claim, --alongside) per the new tests. gate: npx vitest run packages/core/tests/src/lib/work-units/slice-holders.service.spec.ts => 8/8 passed, exit 0. Acceptance cases 'refuses the second agent, and lets the first back in' + 'lets the second agent in when it says so deliberately' are explicit. acceptance: second agent refused with holder ref named, first re-enters own unit, --alongside deliberate bypass works.
- review-attribution: claude-opus-5-5 from Merge pull request #727 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00831-S1-g1/a-slice-held-by-another-agent-is-not-entered (refs/heads/delendai/wip/claude-opus-5-5/implement/x00831-S1-g1/a-slice-held-by-another-agent-is-not-entered) (8acb6c0369b1dba067808d11e16f3235ff5d1809), opened by minimax-3

## dependency graph

None.

## acceptance

- A second agent entering a slice another agent holds is refused, with the
  holder's ref named; the first agent re-enters its own unit.
- `--alongside` lets the second agent in deliberately.
