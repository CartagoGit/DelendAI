---
id: x00218
title: "loader: grafo de dependencias con estados y registro topológico (dependencia fallida bloquea dependientes)"
kind: fix
status: done
type: proposal
track: lifecycle
date: 2026-08-24
---

# x00218 — loader: grafo de dependencias con estados y registro topológico (dependencia fallida bloquea dependientes)

## Goal

Modelar el arranque de plugins como un **grafo de dependencias con estados**, de modo que una dependencia fallida bloquee a sus dependientes.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §3 PL-003 — dependencias deben estar `active`, no solo `resolved`
- §3 PL-004 — detectar ciclos de dependencias

Estados: `discovered → resolved → validated → registering → active`, más `failed`, `blocked`, `disposed`. Registro topológico. Caso objetivo: `A dependsOn B`; si `register(B)` falla → `B = failed`, `A = blocked-by-dependency` (no se ejecuta `register(A)`). Ciclos (`A→B→C→A`) producen error claro antes de ejecutar side effects.

## why

Hoy la dependency gate solo comprueba que la dependencia se importó/resolvió, no que arrancó. Un plugin puede quedar activo sobre una dependencia muerta, produciendo fallos en cascada difíciles de diagnosticar.

## non-goals

- No cambiar la fase actual de import/resolución (se mantiene y se extiende con estados).
- No implementar hot-reload (cubierto por la propuesta de cancelación/dispose).
- No alterar el formato de dependsOn en los manifests existentes.

## Slices

- global_gate: type

### S1 — Servicio de grafo de dependencias (DAG + topo + ciclos)
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/dependency-graph.service.ts`
- **Gate**: type
- acceptance:
  - "Construye el DAG desde dependsOn con estados discovered/resolved/validated/registering/active/failed/blocked/disposed."
  - "Detecta ciclos (A->B->C->A) y devuelve error claro."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Registro topológico con bloqueo por dependencia
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/load-plugins.ts`
- **Gate**: type
- acceptance:
  - "register(B) falla => B failed y A blocked-by-dependency (register(A) no se ejecuta)."
  - "El orden de registro respeta el orden topológico."

### S3 — Tests de lifecycle de dependencias
- **Status**: done
- **Files**: `packages/core/tests/src/lib/plugins/dependency-lifecycle.spec.ts`
- **Gate**: type
- acceptance:
  - "Cubre dependency fail, cycle, duplicate plugin y bloqueo en cascada."

## acceptance

- Construye el DAG desde dependsOn con estados discovered/resolved/validated/registering/active/failed/blocked/disposed.
- Detecta ciclos (A->B->C->A) y devuelve error claro.
- register(B) falla => B failed y A blocked-by-dependency (register(A) no se ejecuta).
- El orden de registro respeta el orden topológico.
- Cubre dependency fail, cycle, duplicate plugin y bloqueo en cascada.
