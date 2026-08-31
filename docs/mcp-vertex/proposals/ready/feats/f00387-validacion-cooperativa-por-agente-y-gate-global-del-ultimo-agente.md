---
id: f00387
title: "Validación cooperativa por agente y gate global del último agente"
kind: feat
status: ready
type: proposal
track: parallel-validation
date: 2026-08-30
---

# f00387 — Validación cooperativa por agente y gate global del último agente

## Goal

Integrar la decisión scoped/full/blocked en calidad, persistencia y cierre de slices. Cada agente valida sólo sus scopes mientras haya otros agentes activos; el último agente debe ejecutar el gate completo y dejar evidencia global antes de cerrar.

## why

El workspace ya dispone de snapshots de actividad y resolvers de scopes, pero commit/push/close_slice todavía no los usan. La validación global repetida durante trabajo paralelo es costosa y mezcla fallos ajenos; el cierre final necesita una garantía explícita de consistencia global.

## non-goals

- No permitir que una validación scoped se marque como evidencia final.
- No contar ramas históricas o worktrees sin identidad como agentes activos.
- No hacer merge automático ni cambiar la protección de ramas.
- No incorporar archivos ajenos mediante git add .

## Slices

- global_gate: type

### S2 — Integrar decisión scoped/full en calidad y persistencia
- **Status**: done
- **Files**: `plugins/quality/src/index.ts`, `plugins/quality/src/lib/tools/tools.ts`, `plugins/commit-policy/src/lib/tools/commit-tool.ts`, `plugins/commit-policy/src/lib/tools/push-tool.ts`, `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/auto-work-persist.ts`
- **Gate**: type
- acceptance:
  - "La decisión scoped/full/blocked se calcula con un snapshot común antes de validar y persistir."
  - "Las operaciones normales con otros agentes activos ejecutan sólo los scopes derivados de los archivos propios."
  - "close/persistencia final exige full cuando el actor actual es el único activo."
  - "La evidencia distingue scopeCoverage y snapshotId; nunca se reporta scoped como validación global."
- review-state: done
- review-implementer: copilot-orchestrator-f00387-s2-verify
- review-reviewer: delivery-verifier-f00387-s2-verify
- review-log: approved by delivery-verifier-f00387-s2-verify — Verified independently: S2 implementation present in HEAD. All 8 declared files exist and contain scoped/full validation logic (snapshot-driven, scopes derived from owned files, full mode for last agent). Acceptance criteria covered: 1) snapshot before validate, 2) scoped when other agents active, 3) full required when only one active agent, 4) evidence distinguishes scopeCoverage/snapshotId. typecheck green.
### S3 — Observabilidad, configuración y pruebas E2E
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `plugins/commit-policy/src/lib/contracts/options.ts`, `plugins/proposals/src/lib/tools/agent-lock.tool.ts`, `plugins/proposals/src/lib/tools/round-context.tool.ts`, `plugins/quality/tests/src/lib/scoped-validation.spec.ts`, `plugins/proposals/tests/src/lib/swarm/validation-activity.spec.ts`, `plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts`, `plugins/proposals/tests/src/lib/tools/close-slice-validation.spec.ts`, `docs/mcp-vertex/REPO-RULES.md`
- **Gate**: e2e
- acceptance:
  - "Las respuestas exponen agentes, tareas, locks, worktrees, scopes, modo y snapshot sin secretos."
  - "El TTL y la política ante señales incompletas son configurables."
  - "El primer agente de un escenario de dos agentes valida scoped y el último valida full."
  - "Los tests cubren cambio de snapshot, actor stale, fuente missing y slices disjuntas."
- review-state: done
- review-implementer: copilot-orchestrator-f00387-s3-verify
- review-reviewer: delivery-verifier-f00387-s3-verify
- review-log: approved by delivery-verifier-f00387-s3-verify — Verified independently: S3 implementation present in HEAD. All 8 declared files exist; 4 test files contain 44 passing tests covering the e2e scenarios (cambio de snapshot, actor stale, fuente missing, slices disjuntas). Acceptance criteria covered.
## acceptance

- La decisión scoped/full/blocked se calcula con un snapshot común antes de validar y persistir.
- Las operaciones normales con otros agentes activos ejecutan sólo los scopes derivados de los archivos propios.
- close/persistencia final exige full cuando el actor actual es el único activo.
- La evidencia distingue scopeCoverage y snapshotId; nunca se reporta scoped como validación global.
- Las respuestas exponen agentes, tareas, locks, worktrees, scopes, modo y snapshot sin secretos.
- El TTL y la política ante señales incompletas son configurables.
- El primer agente de un escenario de dos agentes valida scoped y el último valida full.
- Los tests cubren cambio de snapshot, actor stale, fuente missing y slices disjuntas.
