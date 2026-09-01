---
id: v00133
title: "Schema surface, compact projection, artifact handles and task context cost"
kind: perf
status: ready
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
shipped-in: ["fdb49852b"]
---

# v00133 — Schema surface, compact projection, artifact handles and task context cost

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
- **Status**: done
- **Files**: `tools/scripts/measure`, `packages/core/tests/src/lib/token`
- **Gate**: type
- acceptance:
  - "native/swarm/per-plugin/per-tool bytes measured"
  - "schema breakdown available"
  - "task_context_cost p50/p95 corpus defined and reproducible"
- review-state: done
- review-implementer: crow
- review-reviewer: delivery-verifier-v00133-s1-scope-corrected
- review-log: approved by delivery-verifier-v00133-s1-scope-corrected — Aprobada bajo scope corregido: medición reproducible con valores fijados, breakdown de schemas y corpus task_context p50/p95. La integración del dashboard se satisfizo en S1a, ya cerrada.
### S1a — Integrate token budget dashboard publication
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `tools/scripts/report/token-budget-dashboard.script.ts`, `tools/scripts/report/token-budget-dashboard.spec.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "dashboard incorpora task_context_cost p50/p95 medido por S1"
  - "token-budget-dashboard.spec.ts fija el contrato reproducido del artefacto publicado"
  - "TOKEN-BUDGETS.md se regenera desde la medicion sin tocar release track"
- review-state: done
- review-implementer: crow
- review-reviewer: delivery-verifier-v00133-s1a-final
- review-log: approved by delivery-verifier-v00133-s1a-final — Aprobada funcionalmente: dashboard consume directamente la medición reproducible y publica el addendum. La validación focalizada pasó 2/2; el fallo agregado fue externo, en observability provenance, no en este scope.
### S2 — Compact projection and result handles
- **Status**: done
- **DependsOn**: [S1, S1a]
- **Files**: `packages/core/src/lib/contracts/output`, `packages/core/src/lib/handles`, `plugins/proposals/src/lib/api`, `plugins/orchestrator-runner/src`
- **Gate**: e2e
- acceptance:
  - "compact/full and fields/limit/cursor/maxBytes contracts"
  - "large result chaining through bounded handles"
  - "authorization/redaction/expiry tests"
  - "full fallback remains compatible"
- review-state: done
- review-implementer: implementation-runner
- review-reviewer: delivery-verifier-v00133-s2-final
- review-log: approved by delivery-verifier-v00133-s2-final — Primitive compartida `projectValue` con `mode/fields/limit/cursor/maxBytes`, `IArtifactHandle` con `digest/viewerToken/expire/redact`, adaptador `projectProposalsStableTools` consume la surface estable sin perder el full fallback. 17/17 tests focales pass, exit code 0, HEAD af2265b.

## acceptance

- native/swarm/per-plugin/per-tool bytes measured
- schema breakdown available
- task_context_cost p50/p95 corpus defined and reproducible
- dashboard incorpora task_context_cost p50/p95 medido y publicado con spec reproducible
- compact/full and fields/limit/cursor/maxBytes contracts
- large result chaining through bounded handles
- authorization/redaction/expiry tests
- full fallback remains compatible

## notes

- S1 queda explicitamente acotada a la medicion reproducible de catalog/task_context_cost para mantener una salida pequena y verificable.
- S1a absorbe la integracion de `tools/scripts/report/token-budget-dashboard.script.ts`, su spec y `docs/mcp-vertex/TOKEN-BUDGETS.md` para dar ownership valido al dashboard sin abrir release track.
- S2 pasa a depender de S1 y S1a para que la evolucion de projection/handles arranque sobre baseline y artefacto ya fijados.
