---
id: x00225
title: "registry: auto-plugin-selector en el índice y drift de backend-api"
kind: fix
status: done
type: proposal
track: registry
date: 2026-08-24
---

# x00225 — registry: auto-plugin-selector en el índice y drift de backend-api

## Goal

Corregir dos drift concretos del catálogo: la ausencia de `auto-plugin-selector` en el registry y la contradicción del preset `backend-api` con la knowledge del plugin `api`.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §10 REG-001 — añadir/confirmar `auto-plugin-selector` en registry
- §11 PRE-003 — revisar drift de `backend-api` (una sola verdad)

`auto-plugin-selector` es público (`publishConfig.access: public`, versión 0.1.1) pero no está en FIRST_PARTY_PLUGIN_INDEX — el sistema que recomienda plugins no conoce al plugin que recomienda plugins. La knowledge del plugin API afirma que `backend-api` incluye api/browser/observability, pero el PRESET_CATALOG real no los incluye.

## why

Dos síntomas del mismo problema de fondo (fuentes manuales duplicadas): el recomendador de plugins no se recomienda a sí mismo, y el preset backend-api contradice su propia knowledge. Mientras no existan manifests, estos drift deben al menos estar cubiertos por tests.

## non-goals

- No migrar aún a manifests (propuesta de manifests).
- No rediseñar el preset backend-api (solo alinear fuentes).
- No tocar la lógica de scoring del auto-selector.

## Slices

- global_gate: type

### S1 — auto-plugin-selector en el registry y candidatos
- **Status**: done
- **Files**: `packages/core/src/lib/registry/first-party-index.ts`, `plugins/auto-plugin-selector/src/lib/catalog/first-party-candidates.ts`
- **Gate**: type
- acceptance:
  - "auto-plugin-selector aparece en FIRST_PARTY_PLUGIN_INDEX y en sus propios candidatos."
  - "Un test evita regresiones (el auto-selector se conoce a sí mismo)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Alinear backend-api (una sola verdad)
- **Status**: done
- **Files**: `plugins/api/src/index.ts`, `packages/core/src/lib/plugins/preset-catalog.ts`
- **Gate**: type
- acceptance:
  - "La knowledge de api y el PRESET_CATALOG de backend-api describen lo mismo."
  - "Un test/gate compara ambos y falla ante drift (PRE-003)."

## acceptance

- auto-plugin-selector aparece en FIRST_PARTY_PLUGIN_INDEX y en sus propios candidatos.
- Un test evita regresiones (el auto-selector se conoce a sí mismo).
- La knowledge de api y el PRESET_CATALOG de backend-api describen lo mismo.
- Un test/gate compara ambos y falla ante drift (PRE-003).
