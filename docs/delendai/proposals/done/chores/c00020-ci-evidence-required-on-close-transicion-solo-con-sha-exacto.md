---
id: c00020
title: "ci-evidence-required-on-close-transicion-solo-con-sha-exacto"
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
parent-plan: q00005
---

# c00020 — evidence de CI atada al SHA exacto

## Goal

Exigir que, en CI, `proposal_transition` solo permita mover una propuesta a `review` o `done` cuando `evidence.commit` coincida exactamente con `GITHUB_SHA`.

## why

Antes de este cambio bastaba con que hubiera algún `evidence.commit` y al menos un `ci-runs` entry. Eso permitía cerrar o enviar a review con evidencia de otro SHA.

## non-goals

- No cambia el flujo local fuera de CI.
- No reemplaza la validación existente de `validateEvidence`; la complementa con exactitud del SHA.

## Slices

- global_gate: none

### S1 — Exact SHA gate in CI transitions
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- **Gate**: none

## acceptance

- En CI, `evidence.commit` ausente o distinto de `GITHUB_SHA` bloquea `review` y `done`.
- En CI, un `evidence.commit` igual a `GITHUB_SHA` sigue permitiendo la transición cuando el resto de guards pasa.
- La spec focalizada de `proposal_transition` pasa con los casos de mismatch y match.
resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=c00020` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
