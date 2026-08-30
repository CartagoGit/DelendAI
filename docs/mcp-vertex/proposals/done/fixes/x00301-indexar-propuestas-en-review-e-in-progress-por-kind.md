---
id: x00301
title: "Indexar propuestas en review e in-progress por kind"
kind: fix
status: done
type: proposal
track: proposals-index
date: 2026-08-30
shipped-in: [fa9156a2efc094dafe12509d99000799a655a067]
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
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry.spec.ts`
- **Gate**: type
- acceptance:
  - "Una propuesta sintética en review/plans/ y otra en review/feats/ aparecen una vez en el índice."
  - "La inclusión sigue usando Set para no contar duplicados."
  - "La prueba no modifica ni requiere propuestas reales."
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery-verifier
- review-log: approved by delivery-verifier — Revisión independiente completada. fa9156a2efc094dafe12509d99000799a655a067 añade únicamente el escaneo de review/<kind> e in-progress/<kind> y la regresión focalizada; el diff preserva Set/deduplicación y el test usa un root temporal sin propuestas reales.
## acceptance

- Una propuesta sintética en review/plans/ y otra en review/feats/ aparecen una vez en el índice.
- La inclusión sigue usando Set para no contar duplicados.
- La prueba no modifica ni requiere propuestas reales.
