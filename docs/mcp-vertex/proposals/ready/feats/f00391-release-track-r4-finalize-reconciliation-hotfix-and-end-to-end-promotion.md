---
id: f00391
title: "Release track R4: finalize, reconciliation, hotfix and end-to-end promotion"
kind: feat
status: ready
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
---

# f00391 — Release track R4: finalize, reconciliation, hotfix and end-to-end promotion

## Goal

RELEASE TRACK — reservado exclusivamente a release-migration-agent; plan-execution-orchestrator excluido. Problema/evidencia: el PR #50 no era una frontera estable y el nuevo modelo necesita completar el ciclo sin merge silencioso. Objetivo: release_finalize o equivalente seguro, post-merge reconciliation hacia develop sin perder commits posteriores, hotfix reutilizando release/patch/{slug} con source=main, receipts de before/after, rollback/abort y E2E desde cut hasta PR. Diseño: finalize valida estado final, gates, metadata y base; no mergea silenciosamente; tras merge reconcilia version/changelog/generated artifacts/release-only fixes mediante operación explícita y evita merge loops. Alternativas: copiar manualmente a develop o reconstruir el flujo develop -> main; descartadas. Contratos/files esperados: core release state, git/forge adapters, commit-policy, observability, tests E2E y docs. Dependencias: f00390 R3. Compatibility/migration: preservar lockstep, tags, publish y releases abandonadas/restarted. Tests: finalize blocked/ready, merged receipt, reconciliation con commits posteriores, hotfix, abort y rollback, no merge loops. Security: approval explícita, protected main, expected-state final. Token impact: receipts compactos con handles para detalle. CI impact: release gate y prueba end-to-end. Multiagent impact: worktree obligatorio; medir stabilization time, post-cut commits, changed files, gate iterations, conflicts, waits. Rollback: abort candidate o compensating commit documentado; nunca reescritura silenciosa de main. Observability: state transitions, PR, SHAs, versions, gates, actor and timestamps. Acceptance/DoD: ciclo completo probado, finalize no merge silencioso, reconciliation explícita, hotfix path documentado, replacement promotion solo release/* -> main. Parallelizable: después de R3, no con otros release slices. Reviewer: release/governance specialist. Related: q00013, f00388, f00389, f00390.

## why

Cierra el ciclo de release sin perder trazabilidad ni cambios posteriores de develop.

## non-goals

- No ejecutar una release real durante la planificación.
- No mergear el PR #50.
- No borrar ni reescribir develop.

## Slices

- global_gate: e2e

### S1 — Finalize, reconcile and end-to-end release workflow
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/release-finalize`, `plugins/git/src/lib/release-finalize`, `plugins/forge/src/lib/release-finalize`, `plugins/commit-policy/src/lib/release-finalize`, `packages/core/tests/release-finalize`, `plugins/git/tests/release-finalize`, `plugins/forge/tests/release-finalize`
- **Gate**: e2e
- acceptance:
  - "finalize exige readiness y no mergea silenciosamente"
  - "reconciliation conserva commits posteriores de develop"
  - "hotfix usa release/patch/{slug} con source=main"
  - "E2E cut->stabilize->PR->finalize->reconcile"
  - "abort y rollback dejan receipt"

## acceptance

- finalize exige readiness y no mergea silenciosamente
- reconciliation conserva commits posteriores de develop
- hotfix usa release/patch/{slug} con source=main
- E2E cut->stabilize->PR->finalize->reconcile
- abort y rollback dejan receipt
