---
id: f00523
title: "Split per-agent validation from global integration gate"
kind: feat
status: review
type: proposal
track: general
date: 2026-09-07
---

# f00523 — Split per-agent validation from global integration gate

## Goal

Permitir que cada agente cierre y valide únicamente los archivos declarados por su slice, reservando el validate global para el último agente y el gate de promoción a main.

## why

El requisito actual de bun run validate global en close_slice bloquea todos los agentes cuando existe trabajo ajeno incompleto en el checkout compartido.

## non-goals

- No hacer merge automático a main
- No eliminar peer review
- No permitir cerrar slices sin validación acotada o evidencia explícita

## Slices

- global_gate: e2e

### S1 — Definir política y contrato de alcance
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/src/lib/contracts/proposal-transition-input.contract.ts`, `plugins/proposals/src/lib/services/transition-evidence.ts`
- **Gate**: type
- acceptance:
  - "La política distingue validación scoped de slice y validación global de integración."
  - "El contrato documenta el alcance sin romper compatibilidad de las opciones existentes."
- review-state: done
- review-implementer: delendai-impl-20260907
- review-reviewer: delendai-review-20260907
- review-log: approved by delendai-review-20260907 — Revisión independiente: el contrato opcional de validationScope distingue scoped/global y checkTransitionEvidence mantiene compatibilidad con llamadas existentes. Typecheck focalizado y suite transition-evidence pasan.
### S2 — Aplicar gate scoped al cierre de slices
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`
- **Gate**: e2e
- acceptance:
  - "close_slice no exige validate global por defecto."
  - "close_slice conserva resolveValidationDecision y runQuality sobre los archivos de la slice."
  - "auto_work guía al agente hacia validación scoped y no promete validate global por slice."
- review-state: done
- review-implementer: delendai-impl-20260907
- review-reviewer: delendai-review-20260907
- review-log: approved by delendai-review-20260907 — Revisión independiente aprobada: close_slice declara validación scoped por defecto, permite pedir global explícitamente y auto_work separa el gate de integración. Las suites focalizadas y el typecheck reportados pasan.
### S3 — Reservar gate global para integración
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`
- **Gate**: type
- acceptance:
  - "La transición a review no exige validate global."
  - "El cierre terminal de propuesta conserva el gate global."
  - "La guía de continuación refleja que el último agente o integración debe ejecutar validate global."
- review-state: done
- review-implementer: delendai-impl-20260907
- review-reviewer: delendai-review-20260907
- review-log: approved by delendai-review-20260907 — Revisión independiente: review ya no exige validate global; el cierre terminal done conserva la evidencia global. El fallo restante es una expectativa de prueba antigua y corresponde a S4.
### S4 — Cubrir flujo multiagente con pruebas
- **Status**: done
- **DependsOn**: [S2, S3]
- **Files**: `plugins/proposals/tests/src/lib/tools/close-slice-validation.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`, `plugins/proposals/tests/src/lib/continue-proposal.spec.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Una slice puede cerrarse con validación scoped aunque el log global no tenga validate verde."
  - "Una transición terminal sigue rechazando evidencia global ausente o fallida."
  - "Las instrucciones muestran el validate global como gate de integración."
- review-state: done
- review-implementer: delendai-impl-20260907
- review-reviewer: delendai-review-20260907
- review-log: approved by delendai-review-20260907 — Revisión independiente: S4 cubre el flujo scoped/global y las cuatro suites focalizadas pasan con 165 tests. El gate global se mantiene separado y se evalúa a nivel de integración.
## acceptance

- La política distingue validación scoped de slice y validación global de integración.
- El contrato documenta el alcance sin romper compatibilidad de las opciones existentes.
- close_slice no exige validate global por defecto.
- close_slice conserva resolveValidationDecision y runQuality sobre los archivos de la slice.
- auto_work guía al agente hacia validación scoped y no promete validate global por slice.
- La transición a review no exige validate global.
- El cierre terminal de propuesta conserva el gate global.
- La guía de continuación refleja que el último agente o integración debe ejecutar validate global.
- Una slice puede cerrarse con validación scoped aunque el log global no tenga validate verde.
- Una transición terminal sigue rechazando evidencia global ausente o fallida.
- Las instrucciones muestran el validate global como gate de integración.
