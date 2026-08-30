---
id: f00389
title: "Release track R2: expected state, races, idempotency and readiness validation"
kind: feat
status: ready
type: proposal
track: general
date: 2026-08-30
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
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/release-state`, `plugins/git/src/lib/release`, `plugins/forge/src/lib/release`, `packages/core/tests/release`, `plugins/git/tests/release`
- **Gate**: e2e
- acceptance:
  - "dryRun y execute rechazan expected-state obsoleto"
  - "races patch/patch y minor/patch cubiertas"
  - "readiness no permite gates fallando"
  - "reintento idempotente no duplica bump"

## acceptance

- dryRun y execute rechazan expected-state obsoleto
- races patch/patch y minor/patch cubiertas
- readiness no permite gates fallando
- reintento idempotente no duplica bump
