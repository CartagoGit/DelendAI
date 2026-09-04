---
id: x00323
title: "Hermetic generators, TypeScript zero and quality collect gates"
kind: fix
status: blocked
type: proposal
track: general
date: 2026-08-30
---

# x00323 — Hermetic generators, TypeScript zero and quality collect gates

## Goal

GENERAL TRACK — owner lógico plan-execution-orchestrator; nunca reclamar RELEASE TRACK. Problema/evidencia actual en SHA 1d259fc718b5ddf70c44d22a832eb0a595cf9310: `bun run gen:all --check` falla por drift en plugins/error-reporting/README.md y `bun run validate` falla en check:quantitative por drift en docs/delendai/AGENT-BOOTSTRAP.md. El baseline histórico TypeScript no se acepta sin nueva medición. Objetivo: generators herméticos desde checkout limpio, TypeScript tooling estricto con target 0 errors y baseline eliminado cuando sea posible, quality local --fail-fast y CI --collect con paralelización segura y diagnostics agregados. Diseño: sources canónicas -> generación determinista -> artifact; separar diagnóstico de ejecución sin ocultar errores de shell. Alternativas: depender de cache ephemeral, ampliar budgets o esconder casts; descartadas. Contratos/files esperados: tools/scripts generators, packages/core tooling, quality/CI config, tests y docs generadas. Dependencias: R4 puede establecer la frontera de release; contract migration D precede cambios de alto fan-out. Compatibility/migration: ratchet temporal documentado y eliminación progresiva; clean checkout como fixture. Tests: clean checkout gen check, TS error count current/baselined/target, fail-fast local, collect CI, parallel resource locks, aggregate output and retry accounting. Security: no network/cache implicit; commands policy respected. Token impact: diagnostics compactos con handles. CI impact: medir time-to-first-failure, completeness, wall clock, retries. Multiagent impact: worktree escalation para generated/high fan-out; medir conflicts/claims/waits/rereads/polls. Rollback: conservar generator anterior solo durante migración con flag y drift guard. Observability: métricas por generator, error category, first failure and aggregate. Acceptance/DoD: clean checkout green, TS current=0, baseline removable, local/CI modes explicit, no hidden failures, generated docs synced. Parallelizable: generators and measurement can parallelize only on disjoint files; CI integration after both. Reviewer: build/CI specialist. Related: q00013, q00012, q00011. Include required sections: problem, evidence, SHA, objective, non-goals, design, alternatives, contracts, expected files, dependencies, compatibility, migration, tests, security, token impact, CI impact, multiagent impact, rollback, observability, acceptance, DoD, parallelism, worktree, reviewer, related, ownership.

## why

Los gates actuales no son reproducibles ni suficientemente informativos para una rama de release estable.

## non-goals

- No cambiar release contracts.
- No modificar runtime de plugins no relacionado.
- No usar cache local como source of truth.

## Slices

- global_gate: type

### S1 — Generator hermeticity and baseline measurement
- **Status**: pending
- **Files**: `tools/scripts/gen`, `tools/scripts/lint`, `packages/core/tests/src/lib/cli`, `docs/delendai`
- **Gate**: type
- acceptance:
  - "gen:all --check pasa en checkout limpio"
  - "TS errors measured and target 0 recorded"
  - "quantitative generated truth is synchronized"

### S2 — Quality fail-fast and CI collect
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/quality/src`, `plugins/quality/tests`, ` .github/workflows`
- **Gate**: e2e
- acceptance:
  - "local fail-fast"
  - "CI collect aggregate diagnostics"
  - "parallel checks use safe resource policy"
  - "metrics report first failure and wall clock"

## acceptance

- gen:all --check pasa en checkout limpio
- TS errors measured and target 0 recorded
- quantitative generated truth is synchronized
- local fail-fast
- CI collect aggregate diagnostics
- parallel checks use safe resource policy
- metrics report first failure and wall clock
