---
id: x00686
title: "A hand-moved proposal is refused at commit"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00685]
last-transition-id: 00ed9038-032d-46dc-9ebf-be9bd4ac54e3
last-correlation-id: 00ed9038-032d-46dc-9ebf-be9bd4ac54e3
last-transition-from: review
shipped-in:
  - "4e8013ead3e4fc7c4845695b38e25831f14038c7"
---

# x00686 — A hand-moved proposal is refused at commit

## goal

A commit in which a proposal sits in a folder its status does not name
is refused before it is made, with the command that moves proposals
correctly.

## why

On 2026-09-27, MiniMax's branch `delendai/wip/minimax-3/review/f00553-review-g1/review`
committed "close 100+ ready-to-close proposals": 131 files moved into
`done/` with `git mv` (renames only), their frontmatter still
`status: review`. `proposal_transition` never ran, so:

- the index and the state database were not updated;
- no `shipped-in` was recorded;
- the review rounds were never checked.

Nothing refused it at commit time. `lint:proposal-folder-drift` runs only
in CI (`lint:proposals`), so the branch went red after the push (#514).
Meanwhile the owner saw proposals whose Markdown and folder disagree.

## why this design

- **Refuse where it is cheap.** The existing folder-drift lint takes
  under a second. It now runs in pre-commit whenever a proposal file is
  staged, and says what to use instead: `proposal_transition` (MCP) or
  `delendai proposals transition`.

## non-goals

- Repairing MiniMax's branch. Its closes need real transitions, which
  check review approvals and `shipped-in`.

## architecture

- `lefthook.yml`: `proposal-folder-drift` in pre-commit.
- `tools/scripts/lint/proposal-folder-drift.script.ts`: the guidance on
  failure.

## Slices

- global_gate: none

### S1 — Folder drift is refused at commit

- **Status**: done
- **Gate**: `bun tools/scripts/lint/proposal-folder-drift.script.ts`
- **Files**:
  - `lefthook.yml`
  - `tools/scripts/lint/proposal-folder-drift.script.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 4e8013ead. Una propuesta movida A MANO al estado done se rechaza en commit: mover una review proposal a done/ con git mv y commitear lo REFUSA el pre-commit nombrando la propuesta y el comando de transición correcto (proposal-folder-drift +12 wired en lefthook +10), verificado por el implementador ejecutando el hook sobre ese cambio exacto. Los movimientos de estado pasan por proposal_transition (que mueve fichero y actualiza BD a la vez). Acceptance cubierta (criterio único); gate 38/38 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- Moving a review proposal into `done/` with `git mv` and committing is
  refused by pre-commit, naming the proposal and the transition command.
  Verified by running the hook on that exact change.
