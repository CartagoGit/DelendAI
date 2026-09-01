---
id: f00389
title: "Release track R2: expected state, races, idempotency and readiness validation"
kind: feat
status: review
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
shipped-in: ["8514f99f7"]
last-transition-id: 919250b3-2a1a-436e-bd55-045d24a6139c
last-correlation-id: 919250b3-2a1a-436e-bd55-045d24a6139c
last-transition-from: in-progress
---

# f00389 — Release track R2: expected state, races, idempotency and readiness validation

## Goal

RELEASE TRACK — reservado exclusivamente a release-migration-agent; plan-execution-orchestrator excluido. Problema/evidencia: un release preparado desde main=1.4.2 puede colisionar con otro patch que publica 1.4.3, y develop puede avanzar después del cut; el PR #50 demostró que una frontera móvil invalida gates. Objetivo: release_prepare dryRun/execute y release_status/release_validate con expected source SHA, expected main SHA y expected main version; bloquear si cambian entre preview y ejecución; recalcular sin doble bump. Diseño: validación tipada de carreras patch/patch, minor después de patch, releases concurrentes, duplicate slug, abandoned/restarted release; readiness derivado de gates reales y nunca ready con gates fallando. Alternativas: locks globales opacos o confiar en rebase manual; se prefieren expected-state, idempotency keys y receipts. Contratos/files esperados: core release contracts, git/forge adapters, state storage, tests E2E y observability. Dependencias: f00388 R1. Compatibility/migration: preservar tags/changelog/package lockstep y migrar previews existentes. Tests: matrices de carreras, stale expected state, retry idempotente, duplicate candidate, blocked readiness. Security: fail closed ante cambios de base; sin publicación implícita. Token impact: status compact y projection. CI impact: gates reproducibles y diagnostics agregados. Multiagent impact: worktree obligatorio; métricas de locks/waits/retries. Rollback: abortar candidate y conservar receipts. Observability: race reason, expected/actual SHAs, gate iteration and stabilization time. Acceptance/DoD: tools equivalentes implementadas, casos de carrera verdes, no double bump, readiness tipado y evidencia. Parallelizable: parcialmente después de R1, no sobre contratos compartidos. Reviewer: release/governance specialist. Related: q00013, f00388.

## why

El candidato debe ser seguro frente a cambios de main/develop y reintentos concurrentes.

## non-goals

- No abrir el release PR todavía.
- No mergear ni publicar.
- No resolver responsabilidades de GitHub dentro de core.

## Slices

- global_gate: e2e

### S1 — Expected-state release preparation and validation
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/release-state`, `plugins/git/src/lib/release`, `plugins/forge/src/lib/release`, `packages/core/tests/release`, `plugins/git/tests/release`
- **Gate**: e2e
- acceptance:
  - "dryRun y execute rechazan expected-state obsoleto"
  - "races patch/patch y minor/patch cubiertas"
  - "readiness no permite gates fallando"
  - "reintento idempotente no duplica bump"
- review-state: done
- review-implementer: release-r2-readiness
- review-reviewer: release-r2-reviewer
- review-log: requested_changes by delivery-verifier — REQUEST_CHANGES: (1) releasePrepare hace assertNoCollision(list) y luego store.put() en operaciones separadas; IReleaseCandidateStore no tiene reserva atómica, por lo que dos execute concurrentes pueden pasar ambas la comprobación y crear dos candidatos para el mismo target. Falta una prueba que fuerce la ventana TOCTOU y verifique un único candidato. (2) restart no está resuelto: tras un candidato state=aborted, una nueva idempotencyKey con el mismo slug devuelve el candidato abortado con created=false en vez de crear/re reservar un candidato reiniciado, contradiciendo el requisito abandoned/restarted release. Añadir tests explícitos para restart y concurrencia, y ajustar el contrato/implementación. Cobertura ejecutada: 7 tests focalizados, 0 fallos; tsc global bloqueado por error preexistente en plugins/proposals/tests/src/lib/e2e/continue-proposal.e2e.spec.ts:320 (claimMode ausente).
- review-log: approved by release-r2-reviewer — R2 aprobado tras reparación: reserva atómica síncrona, retry idempotente, restart aborted con nueva key, dry-run sin efectos, stale expected-state, matriz de carreras y readiness/status compactos verificados.
## acceptance

- dryRun y execute rechazan expected-state obsoleto
- races patch/patch y minor/patch cubiertas
- readiness no permite gates fallando
- reintento idempotente no duplica bump
