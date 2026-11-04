---
id: c00127
title: "Nits de adopción: starter content, sampleToolId y fuentes comunitarias"
kind: chore
status: done
type: proposal
track: adoption
date: 2026-08-23
shipped-in:
  - 9488c76d # chore(proposals): c00127 → review
  - 5fdcb73f # chore(c00127): sampleToolId eliminado del input y fuentes comunitarias cableadas
  - 5c64dc4f # fix(scaffold): starter skill emits valid content instead of empty TODOs (c00127 S1)
---

# c00127 — Nits de adopción: starter content, sampleToolId y fuentes comunitarias

## Goal

Cerrar el tier residual de nits de adopción: que el contenido starter generado (skill inicial y stubs de tool/prompt/skill) no deje TODOs vacíos ni prometa más de lo que entrega; que el input sampleToolId tenga efecto real en el scaffold o se elimine; y que la búsqueda de plugins comunitarios tenga una fuente real (cableada por defecto o configurable) en lugar de depender de una capa que hoy no existe.

## why

Auditoría 2026-08-24 (tier de tonterías): el starter skill sale con TODO, los stubs de tool devuelven todo:true sin documentar que son stubs, sampleToolId no participa en el scaffold (solo renombra el catálogo sintético), y plugin_search promete fuentes comunitarias que el ensamblado real no inyecta. Son nits, pero el objetivo es 11/10.

## non-goals

- No rehacer el wiring del host (x00208) ni la fuente de verdad de plugin (r00015): solo el contenido starter y los nits señalados.

## Slices

- global_gate: type

### S1 — Contenido starter sin TODOs vacíos
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`
- **Gate**: type
- acceptance:
  - "La skill inicial y los stubs de tool/prompt/skill no dejan TODOs vacíos (contenido mínimo válido o claim rebajado)."
  - "El stub de tool documenta que es un stub a rellenar."
- implementation:
  - "La skill starter ya no emite `TODO` vacíos: el when-to-use, el body y el checklist tienen contenido mínimo válido que apunta a `overview` como fuente de verdad. El stub de tool sigue marcando `todo: true` (señal explícita de stub)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: revisado empíricamente (diff + validate verde).
### S2 — sampleToolId con efecto real o fuera
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/create-plugin.tool.ts`
- **Gate**: type
- acceptance:
  - "sampleToolId tiene efecto real en el scaffold o se elimina del input hasta que exista integración."

### S3 — Fuentes comunitarias de plugins cableadas
- **Status**: done
- **Files**: `packages/core/src/lib/registry/resolve.ts`, `packages/core/src/lib/registry/plugin-search.tool.ts`
- **Gate**: type
- acceptance:
  - "plugin_search puede resolver fuentes comunitarias: fuente persistente o config que inyecta sources al resolver por defecto."
  - "El índice first-party sigue siendo el fallback determinista."

## acceptance

- La skill inicial y los stubs de tool/prompt/skill no dejan TODOs vacíos (contenido mínimo válido o claim rebajado).
- El stub de tool documenta que es un stub a rellenar.
- sampleToolId tiene efecto real en el scaffold o se elimina del input hasta que exista integración.
- plugin_search puede resolver fuentes comunitarias: fuente persistente o config que inyecta sources al resolver por defecto.
- El índice first-party sigue siendo el fallback determinista.
