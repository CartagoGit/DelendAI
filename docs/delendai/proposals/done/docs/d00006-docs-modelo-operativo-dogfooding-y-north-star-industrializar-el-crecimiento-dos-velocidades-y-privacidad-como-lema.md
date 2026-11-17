---
id: d00006
title: "docs: modelo operativo dogfooding y north-star (industrializar el crecimiento, dos velocidades y privacidad como lema)"
kind: docs
status: done
type: proposal
track: dogfooding
date: 2026-08-24
shipped-in:
  - 3df0cd45 # docs(d00006): VISION-AND-OPERATING-MODEL — north-star, regla de crecimiento, dos velocidades, dogfooding y lema de privacidad
---

# d00006 — docs: modelo operativo dogfooding y north-star (industrializar el crecimiento, dos velocidades y privacidad como lema)

## Goal

Documentar el modelo operativo y el north-star que la conversación redefine: MCP Vertex como capa de ingeniería adaptativa (menos contexto, menos repetición, menos coordinación humana, más verificación y automatización); la regla "industrializar el crecimiento" (cada feature nueva cuesta menos mantenimiento que la anterior: manifests, generadores, contratos, SDK de plugin); las dos velocidades (core/runtime conservador y testeado vs plugins rápidos impulsados por uso); el bucle dogfooding "Vertex uses Vertex to improve Vertex"; y el lema de privacidad "MCP Vertex reports its own bugs, not your data".

## why

La conversación redefine la visión del proyecto (de "creador de propuestas" a "capa de ingeniería adaptativa") y propone una regla de crecimiento que evita que la velocidad de añadir conceptos supere a la de consolidarlos. Consolidar ese "por qué" en un documento corto evita que el crecimiento multiplique mantenimiento sin dirección, y es la referencia natural para los slices de dogfooding f00171/f00172.

## non-goals

- No cambiar código ni contratos.
- No duplicar docs de arquitectura existentes: enlazar ARCHITECTURE.md y AGENT-BOOTSTRAP.md.
- No redefinir qué es core (eso es r00017): solo documentar la filosofía de dos velocidades.

## Slices

- global_gate: none

### S1 — North-star y modelo operativo (doc único, enlazado)
- **Status**: done
- **Files**: `docs/mcp-vertex/VISION-AND-OPERATING-MODEL.md`
- **Gate**: none
- acceptance:
  - "Documento con north-star, regla de industrializar el crecimiento, dos velocidades, bucle dogfooding y lema de privacidad."
  - "Enlaza las propuestas existentes (f00158-f00160, f00170-f00172, r00016-r00017) sin duplicar su contenido."
  - "Se integra en el índice de docs (enlazado desde README/docs raíz)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: doc-only, validate verde.
## acceptance

- Documento con north-star, regla de industrializar el crecimiento, dos velocidades, bucle dogfooding y lema de privacidad.
- Enlaza las propuestas existentes (f00158-f00160, f00170-f00172, r00016-r00017) sin duplicar su contenido.
- Se integra en el índice de docs (enlazado desde README/docs raíz).
