---
id: c00142
title: "Web: regenerar docs/capacities desde manifests"
kind: chore
status: done
shipped-in:
    - 64132c3e
type: proposal
track: cli
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track I / c00142"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00191 # mcpv doctor (incluye stale-docs check)
    - c00140 # generar datos cuantitativos (sinergia)
    - d00009 # capability matrix (sinergia)
---

# c00142 — Web: regenerar docs/capacities desde manifests

## Goal

Hacer que las páginas web de `apps/web/src/data/pages/**` que
listan plugins, capabilities o tools estén **generadas** desde los
manifests, no mantenidas a mano.

### Comportamiento actual (BUG)

- `apps/web/src/data/pages/plugins.md`, `overview.md`,
  `capabilities.md` (o equivalentes) contienen listas de plugins
  escritas a mano.
- Después de añadir un plugin, esas listas quedan stale hasta que
  alguien las actualice.
- La auditoría externa (§25) lo señala como drift garantizado.

### Comportamiento deseado

- Las páginas se generan a partir de:
  - `plugins/*/plugin.json` (manifiestos).
  - `packages/contracts/src/capabilities.ts` (Track F + `r00029`).
  - `tools/scripts/gen/quantitative.json` (`c00140`).
- Bloques `<!-- mcp-vertex:begin/end -->` delimitan las secciones
  generadas dentro de la página web.
- Drift check en CI (`apps/web:pages:drift-check`):
  - Falla si una sección generada en disco no coincide con el
    output del generador.
- Script generador: `tools/scripts/gen/web-pages.script.ts`.

## why

- Cierra §25 de la auditoría.
- Cumple R3.4: el catálogo web se regenera desde manifests; las
  páginas no mantienen listas de plugins a mano.
- Sincroniza con `f00191` (doctor) que tiene un check `stale-docs`.
- Sincroniza con `d00009` (capability matrix).

## non-goals

- No cambia el visual de las páginas; solo el contenido generado.
- No convierte TODO el contenido en generado; solo las listas
  estructurales.
- No introduce un CMS.
- No rompe el build de Astro.

## architecture

### 1. Generador

- `tools/scripts/gen/web-pages.script.ts`:
  - Lee manifests + capabilities + quantitative.
  - Emite las secciones generadas a stdout (para que CI las
    compare con el archivo en disco).
- Modos:
  - `--check`: solo verifica, no escribe.
  - `--write`: actualiza los archivos.

### 2. Convención

- Bloques:
  ````markdown
  ## Plugins

  <!-- mcp-vertex:begin web:plugins -->
  …lista generada…
  <!-- mcp-vertex:end web:plugins -->
  ````

### 3. CI

- Drift check en `tier3.yml` (no Tier 1).
- Output claro: qué página está stale y cómo regenerarla
  (`bun tools/scripts/gen/web-pages.script.ts --write`).

### 4. Tests

- `tools/scripts/gen/web-pages.spec.ts`:
  - Genera contra fixtures; verifica que las secciones cuadran.
  - Drift check: si cambia un manifest, el script lo detecta.

## Slices

### S1 — Generador + drift check + aplicación inicial

- **Status**: done
- **Files**: `tools/scripts/gen/web-pages.script.ts`, `tools/scripts/gen/web-pages.spec.ts`, `apps/web/src/data/pages/{plugins,overview,capabilities}.md` (regenerar bloques), `.github/workflows/tier3.yml` (drift check)
- **Gate**: type

## acceptance

- Generador regenera secciones de páginas web.
- Drift check falla CI si no están actualizadas.
- Sin listas hardcodeadas de plugins fuera de los bloques.
- Tests verdes.
- Build de Astro sigue verde.
