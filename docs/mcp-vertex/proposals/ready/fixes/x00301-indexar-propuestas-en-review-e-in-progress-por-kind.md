---
id: x00301
title: "Indexar propuestas en review e in-progress por kind"
kind: fix
status: ready
type: proposal
track: proposals-index
date: 2026-08-30
---

# x00301 — Indexar propuestas en review e in-progress por kind

## Goal

Incluir los subdirectorios review/<kind>/ e in-progress/<kind>/ en el escaneo del registro de propuestas, preservando deduplicación y protección de carpetas.

## why

scanSubtree sólo recibe las carpetas por estado y ready/done por kind; las propuestas en review/<kind> e in-progress/<kind> quedan fuera del índice.

## non-goals

- No editar propuestas existentes
- No cerrar q00004 ni f00281
- No cambiar otros plugins

## Slices

- global_gate: type

### S1 — Añadir subárboles review/in-progress y regresión focalizada
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry.spec.ts`
- **Gate**: type
- acceptance:
  - "Una propuesta sintética en review/plans/ y otra en review/feats/ aparecen una vez en el índice."
  - "La inclusión sigue usando Set para no contar duplicados."
  - "La prueba no modifica ni requiere propuestas reales."

## acceptance

- Una propuesta sintética en review/plans/ y otra en review/feats/ aparecen una vez en el índice.
- La inclusión sigue usando Set para no contar duplicados.
- La prueba no modifica ni requiere propuestas reales.
