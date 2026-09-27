---
id: x00670
title: "A delivered proposal cannot stay in progress"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00654]
last-transition-id: c4063c78-baf3-4eec-a76b-a5a0b6365fa9
last-correlation-id: c4063c78-baf3-4eec-a76b-a5a0b6365fa9
last-transition-from: in-progress
shipped-in:
  - "379186cf3c2990f3d7e7ae1ccc1a0936934a31bc"
---

# x00670 — A delivered proposal cannot stay in progress

## goal

A proposal whose slices are all delivered does not remain in
`in-progress`. The ones that do are handed to review now, and the lint
stops the state from coming back.

## why

On 2026-09-26, 11 proposals had every slice marked `review` or `done`,
with their pull requests merged, while their files sat in
`in-progress/`: x00653, x00654, x00655, x00656, x00658, x00659, x00660,
x00661, x00662, x00663 and f00273. Their authors had edited the slice
statuses but never called `proposal_transition`. As a result, the review
queue never handed them to a reviewer. x00654 had fixed the same state
the day before with a one-off sweep. Nothing stopped it from recurring,
and it did, ten times over, from the agent that wrote x00654.

## why this design

- **Sweep through the tool.** Each proposal is moved with
  `proposal_transition`, using this unit's worktree as `checkout`, so
  the moves travel on a work ref and not in the shared checkout.
- **Refuse the state where it is created.** `proposal-hygiene` gets a
  rule, `delivered-in-progress`: a file under `in-progress/` whose every
  slice status begins `review` or `done` is a finding. It runs in
  pre-commit and in CI, so the pull request that leaves a proposal in
  that state fails until the hand-off is made. Checked against develop
  before the sweep, it flags exactly these 11 and nothing else.

## non-goals

- Moving proposals automatically. A hand-off is the author's statement
  that the work is finished.

## architecture

- `tools/scripts/lint/proposal-hygiene.script.ts`: `sliceStatuses`,
  `delivered-in-progress`.

## Slices

- global_gate: none

### S1 — Sweep the delivered proposals, and refuse the state

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/lint/proposal-hygiene.spec.ts`
- **Files**:
  - `tools/scripts/lint/proposal-hygiene.script.ts`
  - `tools/scripts/lint/proposal-hygiene.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 379186cf3. Una propuesta bajo in-progress/ con TODOS sus slices en review o done es un finding `delivered-in-progress` (la entrega ya ocurrió, no puede seguir in-progress); una con algún slice por entregar, o una bajo review/, no lo es. Tras el cambio, ninguna propuesta de in-progress/ queda con el finding (el estado del árbol era limpio). Regeneración del catálogo de agentes y varias propuestas derivadas. Acceptance cubierta (criterios del .md); gate del lote 22/22. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A proposal under `in-progress/` whose every slice is `review` or
  `done` is a `delivered-in-progress` finding; one with a slice still to
  deliver, or one under `review/`, is not.
- After this change, none of the proposals in `in-progress/` is
  delivered.
