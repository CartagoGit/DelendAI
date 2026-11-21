---
id: x00668
title: "A merged review no longer holds its proposal"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00660]
last-transition-id: 863bcb0e-8a2c-41bd-b9ef-1a2bb2b9c993
last-correlation-id: 863bcb0e-8a2c-41bd-b9ef-1a2bb2b9c993
last-transition-from: review
shipped-in:
  - "c10880f3e4fe2432c7965710c694e7a8713883b2"
---

# x00668 — A merged review no longer holds its proposal

## goal

A review unit whose verdicts the integration branch already holds stops
claiming its proposal. A unit entered in a worktree still claims it
before its first commit.

## why

x00660 made the claim the review unit itself. Any review work ref in
sight counted: a local branch, a remote-tracking ref or a publication
ref. Units outlive their work. A spent publication ref waits up to ten
minutes for the reaper. A remote-tracking copy stays until somebody
fetches with prune. A local ref stays until someone deletes it. Each
kept its proposal "held" by a reviewer who had finished, so the swarm
skipped a proposal nobody was reviewing. An external audit (2026-09-26)
asked for claims aware of abandoned refs.

## why this design

- **Ended means merged.** A ref whose tip the integration branch, or
  what it tracks (`<integration>@{upstream}`), already contains has
  delivered its verdicts, so its claim is over. `for-each-ref --merged`
  answers this for every ref in one call per base.
- **A fresh unit is live.** `work enter` creates the unit at the
  integration tip, so by that measure it would look merged. A ref
  checked out in a worktree (`%(worktreepath)`) therefore always claims.
  That is the claim-before-reading the procedure asks for.
- An unmerged ref still claims, as before. That covers a published
  review whose pull request is still open, and a unit with work of its
  own.

## non-goals

- Expiring an unmerged claim after some age. A long review is not an
  abandoned one; `work` takeover handles that case.

## architecture

- `plugins/proposals/src/lib/services/review-claims.service.ts`
- `plugins/proposals/src/lib/services/review-queue.service.ts`: passes
  the integration branch.

## Slices

- global_gate: none

### S1 — Claims end when the review merges

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-claims.service.ts`
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real c10880f3e. Un review ref en un commit YA MERGEADO no reclama: ni local sin worktree, ni remote-tracking, ni publication ref gastado (los tres casos son unidades terminadas cuyo PR integró); una unidad de review checked out en un worktree reclama ANTES de su primer commit (worktreepath presente); un ref con commits sin mergear reclama como siempre. review-claims.service +45, queue.service +2, review-queue.tool.spec +53. Es exactamente el caso del claim fantasma de f00552 que esta sesión diagnosticó. Acceptance cubierta; gate 22/22 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A review ref at a merged commit, whether local without a worktree,
  remote-tracking, or a spent publication ref, does not claim.
- A review unit checked out in a worktree claims before its first
  commit.
- A review ref with unmerged commits claims, as before.
