---
id: r00015
title: "Creación de plugins: una sola fuente de verdad y cableado estructural"
kind: refactor
status: done
type: proposal
track: plugins
date: 2026-08-23
---

# r00015 — Creación de plugins: una sola fuente de verdad y cableado estructural

## Goal

Una sola fuente de verdad para el scaffold de plugin (decidir entre plugin-blueprint first-party y el genérico externo, o unificarlos), cableado monorepo por edición estructural (no anclas textuales frágiles), que create_plugin actualice FIRST_PARTY_PLUGIN_INDEX y la carga del host, que el doctor detecte "creado pero no cargado", y eliminar las copias muertas de plugin_add/plugin_search en lib/tools.

## why

Auditoría 2026-08-24 (hallazgos D1-D13): tres writers de wire-plugin insertan por anclas textuales frágiles que pueden romper los archivos; create_plugin no actualiza el índice first-party ni la carga del host (plugin creado pero no descubrible/cargado); hay dos scaffolds de plugin (blueprint first-party muerto vs genérico) y dos copias duplicadas de plugin_add/plugin_search con semántica distinta. Esto hace que crear un plugin sea frágil y confuso para un LLM.

## non-goals

- No tocar scaffold-host (propuesta x00208) salvo en lo estrictamente necesario para el scaffold de plugin.
- No tocar proposal_adopt.
- No cambiar el contrato IPluginWiring salvo para corregir los puntos cableados.

## Slices

- global_gate: type

### S1 — Cableado estructural en wire-plugin
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/wire-plugin.ts`
- **Gate**: type
- acceptance:
  - "PLUGIN_DEFAULTS, PUBLISH_ORDER y PRESET_CATALOG se editan por estructura (AST/anchors específicos y testeados), nunca 'antes de la última };'."
  - "Los writers fallan si el archivo no parsea tras editar."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: revisado en profundidad, validate verde.
### S2 — Una sola fuente de verdad + índice y carga actualizados
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/create-plugin.tool.ts`, `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/src/lib/registry/first-party-index.ts`
- **Gate**: type
- acceptance:
  - "Una sola fuente de verdad de scaffold de plugin (blueprint first-party o genérico, no ambos)."
  - "create_plugin actualiza FIRST_PARTY_PLUGIN_INDEX y la carga del host."
  - "La descripción pública refleja los archivos reales (no 'four scaffold files')."

### S3 — Doctor detecta plugin creado pero no cargado
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/diagnose-plugin-wiring.ts`
- **Gate**: type
- acceptance:
  - "El doctor marca 'creado pero no cargado' cuando el plugin no está en mcp-vertex.config.json."

### S4 — Eliminar copias muertas de plugin_add/plugin_search
- **Status**: done
- **Files**: `packages/core/src/lib/registry/plugin-add.tool.ts`, `packages/core/src/lib/registry/plugin-search.tool.ts`, `packages/core/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "Se eliminan las copias muertas lib/tools/plugin-add.tool.ts y lib/tools/plugin-search.tool.ts tras verificar que ningún import/test las referencia."
  - "El barrel público sigue exportando las versiones de registry/."

### S5 — Tests de cableado de plugin
- **Status**: done
- **Files**: `packages/core/tests/src/lib/scaffold/wire-plugin.spec.ts`
- **Gate**: type
- acceptance:
  - "Specs cubren el cableado estructural y el doctor."

## acceptance

- PLUGIN_DEFAULTS, PUBLISH_ORDER y PRESET_CATALOG se editan por estructura (AST/anchors específicos y testeados), nunca 'antes de la última };'.
- Los writers fallan si el archivo no parsea tras editar.
- Una sola fuente de verdad de scaffold de plugin (blueprint first-party o genérico, no ambos).
- create_plugin actualiza FIRST_PARTY_PLUGIN_INDEX y la carga del host.
- La descripción pública refleja los archivos reales (no 'four scaffold files').
- El doctor marca 'creado pero no cargado' cuando el plugin no está en mcp-vertex.config.json.
- Se eliminan las copias muertas lib/tools/plugin-add.tool.ts y lib/tools/plugin-search.tool.ts tras verificar que ningún import/test las referencia.
- El barrel público sigue exportando las versiones de registry/.
- Specs cubren el cableado estructural y el doctor.
