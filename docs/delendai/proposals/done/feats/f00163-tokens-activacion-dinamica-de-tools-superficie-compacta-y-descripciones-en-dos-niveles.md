---
id: f00163
title: "tokens: activación dinámica de tools, superficie compacta y descripciones en dos niveles"
kind: feat
status: done
type: proposal
track: tokens
date: 2026-08-24
shipped-in:
  - 9e845ddf # feat(tokens): f00163 — activación dinámica, superficie compacta y descripciones en dos niveles
---

# f00163 — tokens: activación dinámica de tools, superficie compacta y descripciones en dos niveles

## Goal

Reducir la superficie MCP inicial mediante **activación dinámica de tools** y una **superficie compacta opcional**.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §9 TOK-006 — bootstrap mínimo (overview, project_context, tool_search, plugin_search, plugin_activate, configuration_center) + carga bajo demanda + fallback estático
- §9 TOK-007 — `--surface=native|adaptive|compact`
- §9 TOK-008 — router compacto opcional (`vertex({ domain, action, args })`)
- §9 TOK-009 — descripciones en dos niveles (summary corta en tools/list; explicación completa en knowledge/resource)
- §9 TOK-010 — mover ejemplos largos fuera de schemas/descriptions
- §28 CHECK-004 — validar clientes MCP que fallan con dynamic tool list changes

El protocolo MCP contempla `notifications/tools/list_changed`; se mantiene fallback estático para clientes que no gestionen superficies dinámicas. Objetivo: bajar el cold-start de decenas de miles de tokens a pocos miles.

## why

Optimizar respuestas individuales (2500→1800 B) es secundario frente a cargar decenas de miles de tokens en schemas antes de resolver una sola tarea. La activación dinámica es el mayor ROI de tokens del proyecto y convierte la superficie en algo adaptativo.

## non-goals

- No convertir el router compacto en la única interfaz.
- No eliminar el modo nativo.
- No romper compatibilidad con clientes MCP que no soportan cambios dinámicos (fallback estático).

## Slices

- global_gate: type

### S1 — Bootstrap mínimo y activación dinámica
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/src/lib/tools/configuration-center.tool.ts`
- **Gate**: type
- acceptance:
  - "Preset bootstrap expone overview/project_context/tool_search/plugin_search/plugin_activate/configuration_center."
  - "plugin_activate/deactivate actualiza la lista de tools y emite tools/list_changed."
  - "Fallback estático documentado para clientes sin cambios dinámicos."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Superficie compacta (router)
- **Status**: done
- **Files**: `packages/core/src/lib/tools/vertex-router.tool.ts`
- **Gate**: type
- acceptance:
  - "vertex({ domain, action, args }) enruta a tools de dominio (git, deps, docs, ...)."
  - "--surface=compact expone solo el router."

### S3 — Descripciones en dos niveles y ejemplos fuera de schemas
- **Status**: done
- **Files**: `packages/core/src/lib/tools/knowledge-tool.ts`
- **Gate**: type
- acceptance:
  - "tools/list usa summaries cortas; la explicación completa vive en knowledge/resource."
  - "Los ejemplos largos se mueven de schemas/descriptions a resources consultables."

## acceptance

- Preset bootstrap expone overview/project_context/tool_search/plugin_search/plugin_activate/configuration_center.
- plugin_activate/deactivate actualiza la lista de tools y emite tools/list_changed.
- Fallback estático documentado para clientes sin cambios dinámicos.
- vertex({ domain, action, args }) enruta a tools de dominio (git, deps, docs, ...).
- --surface=compact expone solo el router.
- tools/list usa summaries cortas; la explicación completa vive en knowledge/resource.
- Los ejemplos largos se mueven de schemas/descriptions a resources consultables.
