---
id: x00708
title: "A republished slice keeps its pull request"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00553, x00677]
last-transition-id: a9251990-064c-46c0-b3ed-b054350b03bb
last-correlation-id: a9251990-064c-46c0-b3ed-b054350b03bb
last-transition-from: review
shipped-in:
  - "00d9c550b"
---

# x00708 — A republished slice keeps its pull request

## goal

Publishing a slice again updates the pull request it already has. It
never opens a second one for the same work.

## why

On 2026-09-27 x00706 S1 was published as its own slice (#562). After a
follow-up commit and a merge of develop it was published again, and
`choosePublicationTarget` measured the work afresh. The larger diff now
named the whole proposal, so the publisher pushed `x00706-all-g1` and
opened #564 beside #562. The existing-publication check skipped a slice
publication only when it was *another* slice's (`alone !== own`). A
slice's own publication fell through to the size decision.

## why this design

- **An existing publication of this slice decides first.** The size
  heuristic chooses where new work goes, not where published work moves.

## non-goals

- Changing the size heuristic.

## architecture

- `packages/core/src/lib/work-units/publication-target.service.ts`

## Slices

- global_gate: none

### S1 — Same slice, same pull request

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/lib/publication-target.service.spec.ts`
- **Files**:
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/tests/src/lib/work-units/publication-target.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 00d9c550b (x00708 S1, merge PR #565). fix(work): a republished slice keeps its pull request. El republish de un slice que ya tenía PR reabre el PR existente en lugar de abrir uno nuevo (no duplica la PR ni cierra la anterior). 16/16 verde en work-publish.service.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #565 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00708-all-g1/a-republished-slice-keeps-its-pull-request (refs/heads/delendai/wip/claude-opus-5-5/implement/x00708-all-g1/a-republished-slice-keeps-its-pull-request) (00d9c550b3e33d93a8751ed72af011985ed915d1), opened by minimax-m3

## dependency graph

None.

## acceptance

- A slice published alone, measured again as a small proposal, still
  targets its own publication. Without the fix the spec fails.
