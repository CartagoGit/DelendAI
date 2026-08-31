---
id: v00134
title: "Schema surface, compact projection, artifact handles and task context cost"
kind: perf
status: ready
type: proposal
track: general
date: 2026-08-30
---

# v00134 — Schema surface, compact projection, artifact handles and task context cost

## Goal

GENERAL TRACK — owner lógico plan-execution-orchestrator; RELEASE TRACK excluido. Problema/evidencia actual en SHA 1d259fc718b5ddf70c44d22a832eb0a595cf9310: vertex native mide 195 tools/266811 B, swarm 165/194010 B y proposals aporta 49703 B; el coste histórico dominante está en schemas, especialmente outputSchema, no solo en descripciones. Objetivo: medir native tool count, total bytes, input/output schema bytes, per-plugin/per-tool hotspots; introducir primitive reutilizable compact/full y projection con detail, fields, limit, cursor, maxBytes donde proceda; permitir artifact/result handles para chaining de resultados grandes sin reinyectar blobs; medir task_context_cost end-to-end p50/p95 en corpus de búsqueda-edición-validación, proposal lifecycle, CI diagnosis, security, PR, impact analysis y release. Diseño: conservar capabilities detalladas y reducir working set mediante projection; handles con ownership, expiry, redaction y bounded retrieval; no reducir payloads que cambien contratos sin versioning. Alternativas: acortar prose sin medir schemas, subir budgets o exigir rereads; descartadas. Contracts/files esperados: core output/projection/handle contracts, adaptive/token measurement, plugins/proposals/orchestrator-runner hot spots, scripts, tests y TOKEN-BUDGETS generated docs. Dependencias: x00323 para gates reproducibles; r00044 para capability/transaction boundaries; f00388-f00391 consumen receipts compactos. Compatibility/migration: detail full sigue disponible, compact es default solo donde medido, handles versionados y bounded. Tests: byte-accurate UTF-8, maxBytes, field projection, cursor, handle expiry/authorization/redaction, schema snapshots, task corpus p50/p95. Security: no handles de datos privados sin grants; no ampliar output; fail closed. Token impact: target reducción medida por hotspot sin degradar task success. CI impact: budgets y regression gates reales; medir wall clock/retries. Multiagent impact: fewer rereads/polls, measure calls, semantic conflicts and lock waits. Rollback: feature flags per tool and full fallback. Observability: bytes, schema shares, handle counts, retrieval size, calls, latency, task success and p50/p95. Acceptance/DoD: baseline/target table generated, hot spots prioritized by evidence, compact/full/projection reusable, handles chained safely, task_context_cost dashboard and regression gate. Parallelizable: measurement and primitive design can split by disjoint files; integration after r00044. Reviewer: token/performance specialist. Related: q00013, x00323, r00044, f00388-f00391. Required sections: problem, evidence, SHA, objective, non-goals, design, alternatives, contracts, expected files, dependencies, compatibility, migration, tests, security, token/CI/multiagent impact, rollback, observability, acceptance, DoD, parallelism, worktree, reviewer, related, ownership.

## why

La superficie native y los resultados grandes consumen contexto; hace falta medir y reducir el coste real de tareas, no solo tools/list.

## non-goals

- No eliminar capacidades detalladas.
- No subir presupuestos para ocultar regresiones.
- No duplicar contracts de release.

## Slices

- global_gate: e2e

### S1 — Measure catalog and task context cost
- **Status**: pending
- **Files**: `tools/scripts/measure`, `packages/core/tests/src/lib/token`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "native/swarm/per-plugin/per-tool bytes measured"
  - "schema breakdown available"
  - "task_context_cost p50/p95 corpus defined and reproducible"

### S2 — Compact projection and result handles
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/contracts/output`, `packages/core/src/lib/handles`, `plugins/proposals/src/lib/api`, `plugins/orchestrator-runner/src`
- **Gate**: e2e
- acceptance:
  - "compact/full and fields/limit/cursor/maxBytes contracts"
  - "large result chaining through bounded handles"
  - "authorization/redaction/expiry tests"
  - "full fallback remains compatible"

## acceptance

- native/swarm/per-plugin/per-tool bytes measured
- schema breakdown available
- task_context_cost p50/p95 corpus defined and reproducible
- compact/full and fields/limit/cursor/maxBytes contracts
- large result chaining through bounded handles
- authorization/redaction/expiry tests
- full fallback remains compatible
