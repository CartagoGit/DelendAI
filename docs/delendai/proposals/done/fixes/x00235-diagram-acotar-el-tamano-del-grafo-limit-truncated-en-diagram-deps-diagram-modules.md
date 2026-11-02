---
id: x00235
title: "diagram: acotar el tamaño del grafo (limit + truncated) en diagram_deps/diagram_modules"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-08-24
related:
  - a00087
---

# x00235 — diagram: acotar el tamaño del grafo

## Goal

`diagram_deps` y `diagram_modules` devuelven el grafo completo sin tope (`plugins/diagram/src/lib/tools/diagram-graph.tool.ts#L83` y `#L106`): `buildModuleGraph` recoge todos los `.ts` y todos los edges de import y el render los emite todos. En un paquete grande la salida es un sumidero de tokens por llamada.

Añadir un parámetro `limit` (nodos) con recorte determinista y un flag `truncated:true` en el output cuando se recorta, sin romper el contrato actual.

## why

Hallazgo a00087 #1 (confirmed · media). La dimensión de coste de tokens es parte del scoreboard de la auditoría; los tools de diagrama son los únicos de este grupo sin acotación de output.

## non-goals

- No cambiar el formato mermaid ni los campos `nodes`/`edges` (solo se añade `truncated` opcional y `limit`).
- No hacer el grafo incremental (fuera de alcance).
- No tocar `diagram_erd` / `diagram_proposals` (ya emiten un grafo pequeño determinista).

## Slices

- global_gate: lint

### S1 — limit + truncated en los dos grafos
- **Status**: done
- **Files**: `plugins/diagram/src/lib/tools/diagram-graph.tool.ts`, `plugins/diagram/src/lib/graph/build-module-graph.ts`, `plugins/diagram/src/lib/graph/build-graph.ts`
- **Gate**: lint
- acceptance:
  - "`limit: N` recorta nodos/edges de forma determinista (p. ej. top-N por grado, sorted)."
  - "`truncated: true` aparece en el output cuando se recorta; ausente cuando no."
  - "Sin `limit` el comportamiento por defecto sigue siendo razonable (o hereda un tope por defecto documentado)."
  - "Los specs cubren grafo recortado, flag `truncated` y determinismo."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde (a nivel de mi lote).
## acceptance

- El output de `diagram_deps`/`diagram_modules` acepta `limit` y devuelve `truncated` cuando recorta.
- Recorte determinista (orden estable) y sin regresión en el grafo sin recorte.
- `bun run lint:proposals` exits 0 y los specs de diagram pasan.
