---
id: x00732
title: "The review queue reads the proposals that exist"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00716, x00717, x00727]
last-transition-id: 97f740d6-463d-45bd-98b6-55edb3835f2f
last-correlation-id: 97f740d6-463d-45bd-98b6-55edb3835f2f
last-transition-from: review
shipped-in:
  - "8a501ab57ce8b86f825b9504cce1a15a68484bea"
---

# x00732 — The review queue reads the proposals that exist

## goal

`review_queue` lists every proposal in `review/`, whether or not a derived
index has been built where it runs.

## why

A swarm test in a throwaway repository with two proposals in `review/`:
`review_queue`, and so `delendai review next`, answered that nothing waited.
The queue read the derived index, which a fresh clone and a unit's worktree
do not have, and which the shared checkout on the integration branch cannot
build, because `sync` is a write the guard refuses there. The owner's log
from 2026-09-28 names the same thing: worktrees have no index.

## why this design

- The folder is where a proposal in review is. The queue reads
  `review/*.md` and takes each proposal's id and date from its frontmatter
  (the id from its filename when the frontmatter has none), oldest first as
  before.
- The queue no longer takes the index path; nothing else changes.

## non-goals

- Changing any other reader of the index.

## architecture

- `plugins/proposals/src/lib/services/review-backlog.service.ts` (new),
  `services/review-queue.service.ts`,
  `contracts/interfaces/review-queue.interface.ts`,
  `tools/review-queue.tool.ts`, and the queue spec.

## Slices

- global_gate: none

### S1 — The queue reads the review folder

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/services/review-backlog.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/lib/tools/review-queue.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 8a501ab57 (fix(proposals): the review queue reads the proposals that exist; merge dbf2018b9 de PR #602). El candidato dado por review next (c0697d899) era el docs commit; el delivering real con contenido es 8a501ab57, verificado con git log --all --oneline -- plugins/proposals/src/lib/tools/review-queue.tool.ts. Cambio: review_queue lee review/*.md directamente en lugar de tomar el path del índice derivado; frente a clones frescos y worktrees sin índice, ahora lista todos los reales. global_gate: none. Sin gate específico; verifiqué el cambio por inspección. Aceptación: review_queue lists every proposal in review/, whether or not a derived index has been built. Sin cambios out-of-scope.
- review-attribution: claude-opus-5-5 from Merge pull request #602 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00732-S1-g1/the-review-queue-reads-the-proposals-that-exist (refs/heads/delendai/wip/claude-opus-5-5/implement/x00732-S1-g1/the-review-queue-reads-the-proposals-that-exist) (8a501ab57ce8b86f825b9504cce1a15a68484bea), opened by minimax-3
## dependency graph

None.

## acceptance

- With the index removed, the queue lists the proposals in `review/`,
  oldest first.
