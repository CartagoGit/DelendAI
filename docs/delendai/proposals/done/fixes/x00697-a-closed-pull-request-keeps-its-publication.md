---
id: x00697
title: "A closed pull request keeps its publication"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00687, x00691]
last-transition-id: ef4cf508-d12a-42a6-9e2e-53c35124626b
last-correlation-id: ef4cf508-d12a-42a6-9e2e-53c35124626b
last-transition-from: in-progress
---

# x00697 — A closed pull request keeps its publication

## goal

The queue's reaper deletes a publication ref only when its pull request
merged. A publication whose pull request was closed without merging is
kept.

## why

On 2026-09-27 three pull requests were closed without merging (#540,
#542, #543). Minutes later their publication refs were gone from the
forge, although their commits were in no other ref. The reconciler
classified any finished pull request, merged or closed, as
`publication-spent` ("the ref has delivered whatever it was going to"),
and the queue's reap step deleted it. Its own comment says the opposite:
"only a delivered pull request is evidence that deleting the ref loses
nothing". x00687 stops agents deleting work that exists nowhere else;
the queue did the same thing to a closed pull request's work.

## why this design

- **Only a merge delivers.** `publication-spent` now means merged. A
  closed pull request's ref is `publication-closed`: neither reaped nor
  a violation, since a violation would turn every certification red
  over a pull request somebody chose to close. It stays for its author
  to reopen or to end deliberately.

## non-goals

- Deciding when a closed publication may be discarded. That is its
  author's call.

## architecture

- `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`: the
  `publication-closed` role.
- `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`: the role
  for a closed pull request.

## Slices

- global_gate: none

### S1 — Closed publications are kept

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/ref-lifecycle/reconcile.spec.ts`
- **Files**:
  - `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`
  - `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`
  - `packages/core/tests/src/lib/ref-lifecycle/reconcile.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- A merged pull request's publication is reapable. A closed one's is
  `publication-closed`, not reapable and not a violation.
