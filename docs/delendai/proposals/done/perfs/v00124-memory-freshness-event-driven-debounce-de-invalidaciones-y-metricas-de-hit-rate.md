---
id: v00124
title: "memory: freshness event-driven, debounce de invalidaciones y métricas de hit-rate"
kind: perf
status: done
type: proposal
track: memory-mcp
date: 2026-08-24
---

# v00124 — memory: freshness event-driven, debounce de invalidaciones y métricas de hit-rate

## Goal

Hacer que el plugin de memoria actualice su freshness de forma event-driven (no en cada tool call), con debounce, y medir el hit-rate.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §14 MEM-001 — evitar refresh en cada tool call
- §14 MEM-002 — debounce de invalidaciones
- §14 MEM-003 — métrica de hit-rate (recall calls, notes returned, digest reused, bytes avoided, sin guardar queries)
- §14 MEM-004 — evaluar BM25 vs hybrid según coste real

Hoy el hook `onToolCall` dispara `refreshFreshnessAdvisory()` en cada llamada a cualquier tool, produciendo refrescos superpuestos sin beneficio. Objetivo: mutation → invalidate; checkpoint event → refresh; mtime changed → refresh; en caso contrario → cached, con debounce de 100–500 ms.

## why

El refresco global en cada tool call añade I/O y cálculo sin aportar frescura real en sesiones activas. Event-driven + debounce elimina ese coste, y el hit-rate permite medir si la memoria está ahorrando contexto de verdad.

## non-goals

- No cambiar la semántica de recall/compaction.
- No guardar queries (solo agregados locales).
- No sustituir BM25 por vector sin benchmark (MEM-004).

## Slices

- global_gate: type

### S1 — Freshness event-driven con debounce
- **Status**: done
- **Files**: `plugins/memory/src/lib/services/checkpoint-freshness.ts`, `plugins/memory/src/index.ts`
- **Gate**: type
- acceptance:
  - "El refresh se dispara por mutation/checkpoint/mtime, no en cada tool call (MEM-001)."
  - "Debounce de 100-500 ms evita lecturas simultáneas repetidas (MEM-002)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Métricas de hit-rate
- **Status**: done
- **Files**: `plugins/memory/src/lib/services/store-recall.ts`
- **Gate**: type
- acceptance:
  - "Mide recall calls, notes returned, digest reused, bytes avoided, sin queries (MEM-003)."
  - "El helper nuevo de debounce se crea en plugins/memory/src/lib/services/freshness-debounce.ts."

## acceptance

- El refresh se dispara por mutation/checkpoint/mtime, no en cada tool call (MEM-001).
- Debounce de 100-500 ms evita lecturas simultáneas repetidas (MEM-002).
- Mide recall calls, notes returned, digest reused, bytes avoided, sin queries (MEM-003).
