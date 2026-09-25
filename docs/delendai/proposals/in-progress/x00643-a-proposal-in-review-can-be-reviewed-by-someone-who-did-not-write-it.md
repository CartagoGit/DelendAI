---
id: x00643
title: "A proposal in review can be reviewed by someone who did not write it"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
tags:
    - review
    - lifecycle
    - independence
last-transition-id: 7e6f9e77-8db3-4b6b-a019-017237a7b663
last-correlation-id: 7e6f9e77-8db3-4b6b-a019-017237a7b663
last-transition-from: ready
---

# x00643 — A proposal in review can be reviewed by someone who did not write it

## goal

Every proposal that reaches `review/` can be verified by a second agent
and leave it — to `done` when the work holds, back to `in-progress` when
it does not — through `proposal_review` alone, without the reviewer
pretending to be the implementer and without a forced transition.

## why

Measured on 2026-09-25 against `develop` (48ef03748): 113 proposals sit
in `review/` and none of them can be closed by a reviewer.

- `proposal_review` only accepts a verdict on a slice whose round was
  opened by the implementer's `action=submit`. Moving a proposal into
  `review/` — by `proposal_transition` or by hand, which is what the
  authors actually do — opens no round. The reviewer is refused with
  `nothing is in review (status: none); submit it first`, and submitting
  under its own name would make it the implementer and bar it from
  approving. The implementer's session is long gone.
- 54 of those proposals have every slice hand-marked `done` with no
  approval at all; `proposal_review` reads them as `none` too, so the
  same refusal applies, and `review → done` fails `peer-review-missing`.
- 67 have no frontmatter `shipped-in`, so even an approved proposal fails
  `missing-shipped-in` — although the reviewer's approval already carries
  the verified `evidence.commitHash`, which nothing writes down.
- When the last slice is approved, the handler rewrites the frontmatter
  to `done` but leaves the file in `review/` and records an
  "auto-transition repair" instead of running the transition.

The implementer identity a historical round needs is not lost: every
pull request of this repository is merged from
`<prefix>/pr/<agent>/<proposal>-<slice>-g<n>/<topic>`, so the merge that
brought the delivering commit into the integration branch names the
agent that wrote it. The Git author is not that identity — every commit
here has the same author.

## non-goals

- A reviewer never submits on the implementer's behalf, and never names
  the implementer itself: the name comes from Git or the review is
  refused with the missing datum.
- No relaxation of reviewer ≠ implementer, of the evidence an approval
  carries, or of the gates `review → done` runs.
- Historical proposals are not edited to look reviewed.

## Slices

- global_gate: e2e

### S1 — A reviewer opens the round a historical delivery never opened

- **Status**: pending
- **Gate**: e2e
- **Files**: `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/generated/tool-outputs.ts`, `tools/scripts/review/proposal-review.script.ts`, `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- acceptance:
  - "On a proposal with status review, approve or request_changes on a slice with no review round and a verified delivering commit opens the round under the implementer named by the pull request that merged that commit (or its Co-Authored-By trailer), records how it was derived on the slice, and then applies the verdict."
  - "The commit must exist and change one of the slice's declared files or cite the proposal id; otherwise the verdict is refused naming the commit."
  - "When neither a pull-request ref with an agent segment nor a Co-Authored-By trailer names the implementer, the verdict is refused and the refusal names that missing datum; nothing is written."
  - "A reviewer whose name equals the derived implementer is refused as a self-approval."
  - "request_changes on a slice hand-marked done reopens the slice as in-progress and moves the proposal back to in-progress."

### S2 — The approval that ends a proposal closes it

- **Status**: pending
- **Gate**: e2e
- **Files**: `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-verdict-lifecycle.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/auto-transition.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- acceptance:
  - "An approval appends its evidence.commitHash to the frontmatter shipped-in when it is not already listed."
  - "When every slice of a proposal in review is approved, the approval runs the normal proposal_transition to done: frontmatter, folder and index agree afterwards, with no force and no repair entry."
  - "When that transition is refused (an open dependent, a completeness gate), the approval still stands and the response carries the refusal as proposalCloseBlocker."
  - "Approving one slice does not close a proposal whose other slices carry no approval."

### S3 — Handing a proposal to review opens its rounds

- **Status**: pending
- **Gate**: e2e
- **Files**: `plugins/proposals/src/lib/services/review-handoff.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- acceptance:
  - "proposal_transition to review with an agent opens an in_review round under that agent for every slice that has none, and records the submit identity, so the reviewer finds work waiting."
  - "A slice that already has a round keeps it untouched."

## acceptance

- A reviewer can approve or reject any slice of a proposal in `review/`
  with `proposal_review` alone, including slices delivered before rounds
  existed, and the implementer it is checked against comes from Git.
- The last approval leaves the proposal in `done/` through the normal
  transition, or reports exactly why it could not.
- A proposal handed to review by the tool arrives with its rounds open.
