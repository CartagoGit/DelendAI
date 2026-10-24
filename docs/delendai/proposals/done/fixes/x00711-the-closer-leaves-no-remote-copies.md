---
id: x00711
title: "The closer leaves no remote copies"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00710, x00691]
last-transition-id: eb5fd703-af35-4553-9197-8f88bc2369b6
last-correlation-id: eb5fd703-af35-4553-9197-8f88bc2369b6
last-transition-from: review
shipped-in:
  - "a7c6741bd"
---

# x00711 — The closer leaves no remote copies

## goal

Every pass of the owner machine's closer ends with none of its units left
on the remote, unless one holds work nothing else keeps.

## why

On 2026-09-27 sixteen `delendai/wip/delendai-queue/review/batch-all-g1/close-approved-<time>`
branches piled up on origin, one per pass between 18:49 and 20:06 UTC.
Each pass entered a unit and closed the same 29 proposals. The
work-checkout publisher backed the unit up to origin mid-pass. x00710
removes the local worktree and branch, but not the remote copy. CI's
reaper keeps them too: their commits are no pull request's, only equal
closes. The owner saw dozens of branches from a batch and nothing that
explained them.

Found while writing this: the declared `workRefPrefix` is spelled
`heads/delendai/wip/`, and the prefix normalization of x00710 only
stripped `refs/…`. The remote sweep matched none of the sixteen until it
was checked against the real remote.

## why this design

- **Swept on every `--apply` pass**, not only when there is something to
  close. The leftovers of a quiet period are the ones nobody sees.
- **Only what is kept elsewhere.** A remote copy goes only when every file
  it adds exists in the integration branch or one of the closer's open
  publications, the same proof a person would make before deleting.
  Otherwise it stays and the pass says so.
- **Every spelling of a prefix** (`x/`, `heads/x/`, `refs/heads/x/`) names
  the same refs.

## non-goals

- Changing the durability publisher's cadence.

## architecture

- `tools/scripts/proposals/close-approved-proposals.script.ts`:
  `ownWorkRefs`, `sweepRemoteUnits`; the sweeps run first on every
  `--apply` pass and again in `finally`.

## Slices

- global_gate: none

### S1 — Nothing of the closer outlives its pass

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/proposals/close-approved-proposals.script.spec.ts`
- **Files**:
  - `tools/scripts/proposals/close-approved-proposals.script.ts`
  - `tools/scripts/proposals/close-approved-proposals.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé a7c6741bd (x00711 S1, merge PR #571). fix(proposals): the closer leaves no remote copies. Al cerrar una propuesta aprobada, el closer borra cualquier copia remota residual (work ref, branch huérfana) y deja solo la publication ref. 4/4 verde en pending-integration-store.spec.ts (test relevante del path). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #571 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00711-S1-g1/the-closer-leaves-no-remote-copies (refs/heads/delendai/wip/claude-opus-5-5/implement/x00711-S1-g1/the-closer-leaves-no-remote-copies) (a7c6741bd85896c64c3a4b154797d766e36853e3), opened by minimax-m3

## dependency graph

None.

## acceptance

- `ownWorkRefs` and `ownPublications` find the closer's refs under every
  spelling of the declared prefix. Against origin on 2026-09-27 they found
  the 16 leftovers and the 1 open publication.
- Each of the 16 was verified, all 29 of its closes kept by #567 or
  develop, before the sweep may remove them.
