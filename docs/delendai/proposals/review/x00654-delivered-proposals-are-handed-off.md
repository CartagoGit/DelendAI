---
id: x00654
title: "Delivered proposals are handed off"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-25
priority: P1
related: [x00653]
last-transition-id: 78c0fc9c-1371-48e0-acd5-c7b31bdc3d21
last-correlation-id: 78c0fc9c-1371-48e0-acd5-c7b31bdc3d21
last-transition-from: in-progress
---

# x00654 — Delivered proposals are handed off

## goal

Every proposal whose pull requests merged says so, and reaches the
reviewer.

## why

Of the 19 proposals in `in-progress` on 2026-09-25, only two held
unfinished work: f00509 S2–S5 and f00536 S4. The rest had merged, and
their markdown never said so. The hand-off never reached the
integration branch (x00653): a transition wrote into the shared
checkout on `develop`, where nothing commits. An author's status edits
went the same way, or were never made. The owner saw a long list of
"started and never finished" work that was mostly finished.

Each slice was mapped to the pull request whose changed files match the
slice's declared files. Titles were not used:

| proposal | slices → pull request (merge) |
| --- | --- |
| f00552 | S1 #410 (b2dd2e42d), S2 #415 (2ecf5aeba), S3 #416 (34f163b8c), S4 #418 (816837321) |
| f00272 | S1–S3 #428 (0c42fcd60) |
| f00536 | S1 #433 (03289da1e), S2 #421 (55eae8993), S3 #422 (c6b96a4d0); S4 not delivered |
| x00643 | S1–S3 #451 (07f355f70) |
| x00645 | S1–S2 #450 (abdd94bb3) |
| x00646 | S1–S5 #459 (9b774a291) |
| x00651 | S1–S2 #462 (9ed67d1dd) |

## why this design

Each delivered slice's status names its pull request and merge commit.
Every fully delivered proposal is moved to `review` with
`proposal_transition`, with the call's `checkout` set to this unit's
worktree, so the move rides this work ref and not the shared checkout.
f00536 stays in `in-progress` until S4 ships.

x00643, x00645, x00646 and x00651 belong to another agent whose session
ended. Handing them to review moves nothing of theirs; the verdict stays
with a reviewer who wrote none of them.

## non-goals

- Approving anything. That is a reviewer's call.
- f00509 and f00536 S4, which hold real remaining work.

## Slices

- global_gate: none

### S1 — Delivered slices name their pull request, and delivered proposals reach review

- **Status**: review
- **Gate**: `bun run lint:proposals`
- **Files**:
  - `docs/delendai/proposals/review/f00552-every-fact-names-its-authority-and-every-copy-of-it-is-a-declared-projection.md`
  - `docs/delendai/proposals/review/f00272-useful-tokens-que-fraccion-de-tools-list-se-usa-de-verdad.md`
  - `docs/delendai/proposals/in-progress/f00536-context-frugality-as-an-enforced-agent-property-and-automatic-compaction-of-tool-output.md`
  - `docs/delendai/proposals/review/x00643-a-proposal-in-review-can-be-reviewed-by-someone-who-did-not-write-it.md`
  - `docs/delendai/proposals/review/x00645-edits-no-work-ref-carries-are-reported-not-silent.md`
  - `docs/delendai/proposals/review/x00646-reviewing-proposals-works-the-same-in-any-project-and-from-any-host.md`
  - `docs/delendai/proposals/review/x00651-a-proposal-move-leaves-the-shared-index-alone-and-a-repeated-tombstone-is-the-same-fact.md`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- Every slice listed above names its pull request and merge commit.
- f00552, f00272, x00643, x00645, x00646 and x00651 are in `review`.
- f00536 remains `in-progress` with S4 pending.
- The shared checkout was not written: every move was made in this
  unit's worktree.
