---
id: x00650
title: "A stale red candidate gets one fresh verdict"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
priority: P1
related: [x00636, x00647, x00649]
---

# x00650 — A stale red candidate gets one fresh verdict

## goal

Every open candidate has a fate stated in one place. No candidate stays
red only because nobody ran it again after the integration branch
moved.

## why

The queue moves one candidate at a time (x00636). `queueOrder` leaves red
candidates out, which is right, because a red candidate cannot merge.
But nothing else looked at them either.

On 2026-09-25 `develop` carried a test that expired with the calendar
(x00647). Four candidates went red on it: #451, #458, #459 and #460.
After the fix merged, all four stayed red for hours:

- They were outside the queue, so the hydrator never brought them
  forward.
- Never brought forward, their CI never ran again.
- So they stayed red.

The owner saw green pull requests failing and branches never hydrated.
No rule said what should happen to a red candidate.

## why this design

`candidate-disposition.ts` states the fate of every candidate:

| disposition | when | what happens |
| --- | --- | --- |
| `moves-next` | the queue head | brought forward, armed, merged |
| `refresh-for-overlap` | green, not the head, behind, and the integration branch changed an authored file it changes too | brought forward now |
| `queued` | green, not the head, nothing it changes moved under it | waits its turn |
| `refresh-for-verdict` | red, behind, head is not a merge of the integration branch | brought forward once for a fresh verdict |
| `author` | red and level, or red again after being brought forward | untouched until its author pushes |
| `draft` | draft | its author's |

"Brought forward already" is read from the commit graph: the candidate's
head is a merge whose second parent is in the integration branch. That
covers the hydrator's merges and an author's own merge of the
integration branch, with no state stored anywhere.

A queued candidate is brought forward as soon as the integration branch
changes a file it changes too. Overlap is measured since their merge base
and leaves out generated projections. A conflict, or a combination that
merges cleanly and breaks, then surfaces while it is fresh, not on the
candidate's turn. A candidate that nothing moved under is left alone,
because merging would change nothing it touches, and the forge validates
it on the merge ref regardless. Every candidate therefore takes at most
one merge of the integration branch per change that concerns it
(decided with the owner on 2026-09-25, in place of hydrating every
candidate on every merge).

A genuinely red candidate costs at most one merge of the integration
branch per push by its author. The merge on every
candidate for every merge that x00636 removed does not come back.

The hydrator prints every candidate's disposition on each pass, and
read-only mode prints them too. The answer to "why is this pull request
not moving" is one line of that log.

## non-goals

- Changing the queue order or the head for green candidates.
- Resolving authored conflicts or real failures. Those stay the
  author's.

## architecture

- `tools/scripts/forge/candidate-disposition.ts` (+ `.interface.ts`):
  `candidateDispositions` and `toRefreshForVerdict`, both pure.
- `tools/scripts/forge/keep-the-queue-moving.script.ts`: exports
  `currentQueueFacts`, so the hydrator reads the same facts the queue
  arms by.
- `tools/scripts/git/refresh-candidate-artifacts.script.ts`: after the
  head, reports every disposition and brings forward each
  `refresh-for-verdict` candidate. Its merge-base check is local.

## Slices

- global_gate: none

### S1 — Every candidate has a stated fate, and a stale red one is run again

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/forge tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/candidate-disposition.ts`
  - `tools/scripts/forge/candidate-disposition.interface.ts`
  - `tools/scripts/forge/candidate-disposition.spec.ts`
  - `tools/scripts/forge/keep-the-queue-moving.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`

## dependency graph

None. x00649 (a red integration branch repaired by the queue) is
complementary: that one is about a red `develop`, this one about a red
candidate.

## acceptance

- A red candidate that is behind, with a head that is not a merge of the
  integration branch, is brought forward.
- A red candidate that is level, or red again after being brought
  forward, is left to its author until the author pushes.
- A green candidate that is behind, with an authored file the integration
  branch also changed since their merge base, is brought forward. One
  with no such file is not.
- Green candidates keep the one-at-a-time order.
- Every candidate's disposition and reason are printed on each pass.
- Measured on the live repository (2026-09-25, read-only): #451 and #459
  `refresh-for-verdict`, #458 `moves-next`, #460 `queued`. After #451
  merged: #459 `refresh-for-overlap` (it shares `docs/delendai/api/stable.json`
  and x00643's proposal with #451), #460 and #461 `queued`.

## risks and mitigations

- **A flaky test makes a candidate red after its refresh.** It is then
  the author's until the author pushes, the same as any red run. Nothing
  loops.
