---
id: r00016
title: "registry: plugin manifests como única fuente de verdad y generadores derivados"
kind: refactor
status: done
type: proposal
track: registry
date: 2026-08-24
---

# r00016 — registry: plugin manifests como única fuente de verdad y generadores derivados

## Goal

Convertir el **plugin manifest** en la única fuente de verdad del catálogo, sustituyendo los arrays manuales dispersos.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §10 REG-002 — `plugin.manifest.ts` por plugin con `definePluginManifest`
- §10 REG-003 — generar desde manifests (FIRST_PARTY_PLUGIN_INDEX, docs, web catalog, preset validation, auto-plugin candidates, logos inventory, package inventory, token tables, permissions table, compatibility matrix)
- §10 REG-004 — lint "plugin directory not represented" (public → manifest obligatorio; private → manifest interno explícito)
- §21 MAN-001..010 — schema, lint, generators (registry/web/docs/token budgets/permission catalog), auto-selector desde manifests, detectar paquetes sin manifest y manifests sin paquete
- §20 DOC-003 — lista de plugins del README generada

Relacionado con la propuesta existente `r00015` (scaffold de plugin, una sola fuente de verdad), que se extiende aquí al catálogo completo. Estructura objetivo: `{ id, package, version, visibility, summary, tags, maturity, permissions, presets, tokenBudget, dependencies, capabilities }`.

## why

El catálogo vive duplicado en package.json, FIRST_PARTY_PLUGIN_INDEX, PLUGIN_DEFAULTS, PRESET_CATALOG, READMEs, knowledge, web manifests y TOKEN-BUDGETS. Cuantas más fuentes manuales, más drift. Un manifest por plugin + generadores hace estructuralmente imposible la desincronización.

## non-goals

- No migrar todos los plugins a manifest en una sola pasada (se habilita el sistema y se migran incrementalmente).
- No reescribir el sistema de presets en esta propuesta (propuesta de presets).
- No eliminar los arrays manuales hasta que el generador los sustituya.

## Slices

- global_gate: type

### S1 — definePluginManifest y schema del manifest
- **Status**: done
- **Files**: `packages/core/src/lib/manifest/define-plugin-manifest.ts`
- **Gate**: type
- acceptance:
  - "definePluginManifest con id/package/version/visibility/summary/tags/maturity/permissions/presets/tokenBudget/dependencies/capabilities."
  - "Schema validado con Zod; MAN-001 cubierto."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde.
### S2 — Lint de manifests y representación
- **Status**: done
- **Files**: `tools/scripts/lint/plugin-manifest.script.ts`
- **Gate**: type
- acceptance:
  - "MAN-002/MAN-009/MAN-010: paquete público sin manifest o manifest sin paquete fallan el lint."
  - "REG-004: no hay paquetes invisibles por accidente."

### S3 — Generadores desde manifests
- **Status**: done
- **Files**: `tools/scripts/generate/from-manifests.script.ts`
- **Gate**: type
- acceptance:
  - "Genera FIRST_PARTY_PLUGIN_INDEX, web catalog, docs, token tables, permissions table y compatibility matrix (MAN-003..007, REG-003)."
  - "El auto-plugin-selector consume manifests (MAN-008)."

### S4 — Primer manifest migrado como patrón
- **Status**: done
- **Files**: `packages/core/src/lib/registry/first-party-index.ts`, `plugins/search/plugin.manifest.ts`
- **Gate**: type
- acceptance:
  - "Un plugin (search) migra a manifest y el índice se genera desde él."
  - "La lista de plugins del README se genera (DOC-003)."

## acceptance

- definePluginManifest con id/package/version/visibility/summary/tags/maturity/permissions/presets/tokenBudget/dependencies/capabilities.
- Schema validado con Zod; MAN-001 cubierto.
- MAN-002/MAN-009/MAN-010: paquete público sin manifest o manifest sin paquete fallan el lint.
- REG-004: no hay paquetes invisibles por accidente.
- Genera FIRST_PARTY_PLUGIN_INDEX, web catalog, docs, token tables, permissions table y compatibility matrix (MAN-003..007, REG-003).
- El auto-plugin-selector consume manifests (MAN-008).
- Un plugin (search) migra a manifest y el índice se genera desde él.
- La lista de plugins del README se genera (DOC-003).
