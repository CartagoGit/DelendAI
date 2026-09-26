---
id: x00661
title: "A superseded delivery is not an incomplete one"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00660, x00646]
---

# x00661 — A superseded delivery is not an incomplete one

## goal

A slice reviewed long after it merged is judged on what it delivered.
A later proposal that changed, extended or reverted that work is named
for the reviewer, not held against the slice.

## why

The owner asked it directly on 2026-09-26: a proposal is delivered,
merged, and reviewed two months later. By then another proposal has
changed or reverted part of it. The review procedure told the reviewer
to check every acceptance item "against the diff and the current code",
so the reviewer would find the current code different and request
changes on work that was correct when it landed.

## why this design

- `review_queue` names, per slice, the commits on the integration branch
  after the delivering commit that touched the slice's files
  (`changedSince`, at most ten, with their subjects, where the proposal
  id usually is). Globs in `Files` are passed as git glob pathspecs.
- The procedure says it: a slice is judged on what it delivered. If the
  code differs now and `changedSince` names the later commit that
  changed it, that is not a defect of this slice. The reviewer approves
  on the delivered state and names those commits in the note. Changes
  are requested only for what the delivery itself got wrong.

## non-goals

- Deciding whether the later change was right. That belongs to the later
  proposal's own review.

## architecture

- `plugins/proposals/src/lib/services/review-changed-since.service.ts`:
  `changedSince`. `services/review-procedure.ts` holds the procedure; both
  were split out of `review-queue.service.ts`, which had grown past 400
  lines.
- `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`,
  `contracts/interfaces/review-queue.interface.ts`: the field.

## Slices

- global_gate: none

### S1 — Later changes are named, and the slice is judged on its delivery

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/services/review-changed-since.service.ts`
  - `plugins/proposals/src/lib/services/review-procedure.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`

## dependency graph

Built on x00660 (#474), merged into this branch because both change the
review procedure.

## acceptance

- A slice whose files a later commit changed lists that commit in
  `changedSince`.
- A slice nothing touched afterwards has no `changedSince`.
- The procedure says a slice is judged on what it delivered.
