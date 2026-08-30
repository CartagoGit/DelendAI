---
id: c00140
title: "Generar datos cuantitativos (plugin count, tool count, etc.)"
kind: chore
status: done
type: proposal
track: docs
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in:
    - f5836e9 # S1 generador quantitative + drift check
    section: "Track H / c00140"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00141 # eliminar comentarios fNNNNN
    - f00190 # AGENT.md por package/plugin
    - d00011 # manual editorial manual vs generado
---

# c00140 — Generar datos cuantitativos (plugin count, tool count, etc.)

## Goal

Hacer que **todos los datos cuantitativos** de la documentación
(`docs/mcp-vertex/*.md`) estén **generados** desde el estado real del
repo, no escritos a mano. Un agente o humano debe poder confiar en
"48 plugins", "210 tools", "1525 tests" como números verídicos.

### Comportamiento actual (BUG)

- Varios documentos declaran números hardcodeados:
  - "48 plugins" en `docs/mcp-vertex/AGENT-BOOTSTRAP.md`.
  - "50 plugins" en `apps/web/src/data/pages/overview.md`.
  - Conteos de tests en distintos sitios.
- Estos números quedan stale inmediatamente después de cada merge.
- La auditoría externa (§34, AUD-P0-003) lo marca como bug
  confirmado: dos documentos del propio repo se contradicen.

### Comportamiento deseado

- Script generador: `tools/scripts/gen/all.script.ts` (o
  uno-nuevo-por-documento).
- Datos generados:
  - `plugin.count`, `plugin.countByKind`.
  - `tool.count`, `tool.countByPlugin`.
  - `test.count`, `test.passing`.
  - `package.count`, `app.count`.
  - `metric.totalSurfaceBytes`, etc.
- Salidas:
  - Bloques `<!-- mcp-vertex:begin/end -->` en los `.md` afectados,
    regenerados en cada CI run.
  - JSON estructurado en `build/inspect/quantitative.json`.
- CI: `bun run docs:quantitative:check` falla si hay drift entre el
  bloque generado y el archivo en disco.

## why

- Cierra el bug §34 / AUD-P0-003.
- Cumple R3.2: una sola fuente de verdad para datos
  machine-readable.
- Da confianza a los humanos y agentes que leen la documentación.
- Habilita el dashboard (`tokens:dashboard:check`) y la capability
  matrix (`d00009`).

## non-goals

- No reescribe la prosa de los documentos; solo los bloques de
  números.
- No introduce un sistema de templates; los bloques usan
  comentarios HTML (`<!-- … -->`) que ya son la convención del
  repo.
- No reemplaza al lint `c00141` (eliminar comentarios fNNNNN) — son
  ortogonales.

## architecture

### 1. Script generador

- `tools/scripts/gen/all.script.ts`:
  - Recorre plugins, cuenta tools por manifest, cuenta tests por
    `*.spec.ts`.
  - Emite:
    - `build/inspect/quantitative.json` (machine-readable).
    - Actualiza bloques `<!-- mcp-vertex:begin/end -->` en cada
      `.md` afectado.

### 2. Convención de bloques

````markdown
Some prose here.

<!-- mcp-vertex:begin quantitative:plugins -->
Total plugins: 48
- chore: 14
- feat: 17
- fix: 9
- refactor: 4
- test: 4
<!-- mcp-vertex:end quantitative:plugins -->

More prose.
````

- El script reemplaza solo el contenido entre `begin` y `end`.
- Si el bloque no existe, el script puede (a) añadirlo o (b) fallar
  (configurable). Default: añadirlo en una sección "Quantitative
  facts" al final del documento.

### 3. Tests

- `tools/scripts/gen/all.spec.ts`:
  - Genera contra fixtures y verifica bloques.
  - Drift check: si el JSON cambia, regenerar y comparar.

### 4. CI

- Job `docs:quantitative:check` en `.github/workflows/tier3.yml`
  (no en Tier 1 porque es lento).

## Slices

### S1 — Script generador + drift check en CI

- **Status**: done
- **Files**: `tools/scripts/gen/all.script.ts`, `tools/scripts/gen/all.spec.ts`, `docs/mcp-vertex/AGENT-BOOTSTRAP.md` (regenerar bloque), `apps/web/src/data/pages/overview.md` (regenerar bloque), otros `.md` con números cuantitativos
- **Gate**: type
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: generador escribe build/inspect/quantitative.json, check-quantitative 0 drift, specs 14/14 verde, typecheck tools limpio. Datos cuantitativos generados desde estado real del repo.
## acceptance

- Script regenera bloques `<!-- mcp-vertex:begin/end -->`.
- Drift check falla CI si hay diferencia.
- `AGENT-BOOTSTRAP.md` y `overview.md` quedan con números
  consistentes.
- Tests verdes.
- Sin números hardcodeados fuera de los bloques generados.
