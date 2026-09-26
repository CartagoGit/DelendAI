---
id: x00676
title: "A hand-off survives a canonical rename"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00643]
---

# x00676 — A hand-off survives a canonical rename

## goal

A transition whose document ends up under another name than the move
reported still opens the review rounds on that document, and reports
where the document is.

## why

On 2026-09-26 handing x00671 to review failed with ENOENT. The move
kept the file name `…-project-shape.md`. The index sync that follows
renamed the file to the canonical slug of its title, `…-project-s-shape.md`
(the apostrophe of "project's" becomes a dash). The review-rounds step
then opened the name the move had reported. The hand-off was left half
done: the file was in `review/` but had no rounds for the reviewer, and
the answer named a file that did not exist. Completing it took a round
trip out of review and back.

## why this design

- **Use the file that exists.** After a successful transition, the path
  is checked. When the reported file is missing, the document is looked
  up by its id in the same folder. The rounds are opened there, and the
  answer's `entity.path` and `movedTo` name it.
- The rename itself is correct (canonical names); only the follow-up
  steps were wrong about where the file went.

## non-goals

- Changing when or how the sync renames files.

## architecture

- `plugins/proposals/src/lib/services/transition-landing.service.ts`:
  `landedPath`.
- `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`: the
  rounds and the answer use it.

## Slices

- global_gate: none

### S1 — The rounds and the answer follow the renamed file

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/transition-landing.service.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`

## dependency graph

None.

## acceptance

- A hand-off whose document lands under another name than the move
  reported opens the review rounds in that document, and the answer
  names it.
