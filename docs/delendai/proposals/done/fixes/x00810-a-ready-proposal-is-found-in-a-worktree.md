---
id: x00810
title: "A ready proposal is found in a worktree"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-01
priority: P1
related: [q00022]
last-transition-id: 1dccde73-7367-4450-9aeb-1e1f523665a7
last-correlation-id: 1dccde73-7367-4450-9aeb-1e1f523665a7
last-transition-from: review
shipped-in:
  - "582d53897e04"
---

# x00810 — A ready proposal is found in a worktree

## goal

Every proposal can change status from a work unit's worktree, wherever it
is filed, and reading the index there does not report the whole backlog as
divergent.

## why

On 2026-10-01 `transition-proposal f00547 in-progress`, run in f00547's
own worktree, failed with "no proposal with id f00547 found". A fresh
worktree has no JSON registry, so the locator fell back to scanning the
tree, and the scan kept its own list of folders: the status folders and
`done/<kind>/`. Proposals live under `<status>/<kind>/` for every status,
so no feature, fix or plan in `ready/` could be found — or transitioned —
from any worktree. The id allocator had the same gap once and was fixed
by the shared `PROPOSAL_SCAN_FOLDERS`; the locator never moved to it.

The same worktree showed a second defect: with SQLite now the default
source, every index read compared the projection with a registry that was
not there and reported all 1156 proposals as divergent.

## why this design

- The locator walks `PROPOSAL_SCAN_FOLDERS`, the one list the allocator
  and the drift lint already share, instead of a copy of part of it.
- A registry that is absent is not compared. A registry that exists and
  differs is still reported, as before.

## non-goals

- Taking the JSON registry out of the locator's fast path: that is
  q00022 phase 3.

## Slices

- global_gate: none

### S1 — The locator walks every proposal folder, and an absent registry is not a divergence

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/locate.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/proposals/locate.ts`
  - `plugins/proposals/src/lib/proposals/index-reader.ts`
  - `plugins/proposals/tests/src/lib/proposals/locate.spec.ts`
  - `plugins/proposals/tests/src/lib/proposals/index-reader-rebuild.spec.ts`
- shipped-in: `582d53897e04`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — S1 delivered as specified. locate.ts now derives proposalScanDirs from the shared PROPOSAL_SCAN_FOLDERS constant (same list the id allocator and drift lint walk), so a proposal under ready/feats (or any <status>/<kind>/) is found and transitionable from a worktree with no JSON registry — the exact failure that motivated the proposal (f00547 transition). index-reader.ts treats an absent registry as nothing to compare (divergence []) while an existing-but-different registry is still reported. Gate (declared): vitest run on locate.spec.ts + index-reader-rebuild.spec.ts — 2 files, 11/11 pass in the review worktree, covering both new cases (kind folder of any status with no registry; scan equals allocator folders) and the registry-absent read. Non-goals respected: the JSON registry stays in the fast path (q00022 phase 3 untouched). Slice Status is already done; acceptance block empty so no per-criterion objects are required.
- review-attribution: claude-opus-5-5 from Merge pull request #711 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00810-all-g1/a-ready-proposal-is-found-in-a-worktree (refs/heads/delendai/wip/claude-opus-5-5/implement/x00810-all-g1/a-ready-proposal-is-found-in-a-worktree) (582d53897e048ae282fb67dee12a33cd963d35c7), opened by glm-5.3-flash

## dependency graph

None.

## acceptance

- With no registry on disk, a proposal under `ready/feats/` is located.
- A `sql` read with no registry on disk logs nothing and records parity.
