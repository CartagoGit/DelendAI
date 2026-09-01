---
id: d00010
title: "`vertex://code-map` resource documentado"
kind: docs
status: ready
type: proposal
track: docs
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track H / d00010"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00190 # AGENT.md por package/plugin (fuente del mapa)
    - r00027 # inventario de core/public
---

# d00010 — `vertex://code-map` resource documentado

## Goal

Exponer un **resource MCP** (`vertex://code-map`) que un agente puede
consultar para obtener un mapa del repo: packages, plugins,
capacities, AGENT.md entries, hotspots. Documentar el contrato y
los casos de uso en `docs/mcp-vertex/CODE-MAP.md`.

### Comportamiento actual

- No existe un resource `vertex://code-map`.
- Un agente que quiere entender el repo tiene que leer
  `AGENTS.md`, `AGENT-BOOTSTRAP.md`, hacer `ls`, etc.
- La auditoría externa (§37) lo marca como gap: el LLM no tiene una
  "vista panorámica" del repo servida por el propio host.

### Comportamiento deseado

- Nuevo resource MCP:
  - URI: `vertex://code-map`.
  - MIME: `application/json` o `text/markdown` (configurable).
  - Contenido:
    ```json
    {
      "generatedAt": "2026-08-25T...",
      "packages": [
        { "name": "core", "path": "packages/core", "agent": "..." }
      ],
      "plugins": [
        { "name": "proposals", "capabilities": [...], "tools": [...], "agent": "..." }
      ],
      "hotspots": [
        { "kind": "tool", "id": "proposals.list", "staticBytes": 51834 }
      ]
    }
    ```
- Documentación: `docs/mcp-vertex/CODE-MAP.md` explica el
  contrato, los casos de uso ("cómo encuentro el plugin que toca
  git"), ejemplos de response, y garantías de privacidad.

## why

- Cierra §37 de la auditoría.
- Habilita que un agente tenga una **vista única y consistente** del
  repo, sin tener que ensamblarla con varios tools.
- Complementa a `f00190` (AGENT.md por package/plugin): AGENT.md es
  local, code-map es global.
- Es la base para `vertex_explain` y futuras herramientas de
  explainability (Track J).

## non-goals

- No es un índice de búsqueda full-text (es un mapa estructural).
- No incluye código fuente (solo metadata).
- No reemplaza al `tree` command del shell.
- No es interactivo (no se actualiza en tiempo real).

## architecture

### 1. Resource MCP

- `packages/core/src/lib/code-map/resource.ts`:
  - Implementa `McpResource` con URI `vertex://code-map`.
  - Al hacer `resources/read`, devuelve el mapa serializado.
- El mapa se genera en boot del host (one-shot) y se cachea.
- Refresca al detectar cambios en `package.json` o en manifests.

### 2. Generación

- Reutiliza `tools/scripts/gen/agent-md.script.ts` (Track H,
  `f00190`) como input.
- Añade: capabilities por plugin (Track F), hotspots de tokens
  (Track E).

### 3. Privacidad

- El mapa expone solo `pluginId` público (p. ej. `proposals`,
  `audit`).
- No incluye paths absolutos del host.
- No incluye nombres de tools externas.

### 4. Tests

- `packages/core/tests/src/lib/code-map/resource.spec.ts`:
  - El resource responde a `resources/read vertex://code-map`.
  - El JSON tiene las claves esperadas.
  - Sin filtración de paths privados.

## Slices

### S1 — Resource + documentación + tests

- **Status**: pending
- **Files**: `packages/core/src/lib/code-map/resource.ts`, `packages/core/src/lib/code-map/generator.ts`, `packages/core/tests/src/lib/code-map/resource.spec.ts`, `docs/mcp-vertex/CODE-MAP.md`
- **Gate**: type

## acceptance

- Resource `vertex://code-map` responde.
- Documentación publicada en `docs/mcp-vertex/CODE-MAP.md`.
- Tests verdes.
- Sin filtración de paths privados ni tool names externos.
