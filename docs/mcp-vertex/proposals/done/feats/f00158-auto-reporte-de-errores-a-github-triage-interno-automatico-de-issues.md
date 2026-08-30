---
id: f00158
title: "Auto-reporte de errores a GitHub + triage interno automático de issues"
kind: feat
status: done
type: proposal
track: github
date: 2026-08-24
shipped-in:
  - 0fc5cff9 # chore(proposals): f00158 → review (plugins ya implementados y testeados)
  - d7d5603c # docs(proposals): f00158 + x00216 — dedupe por identidad del error, no por tipo
  - 4d78419a # docs(proposals): f00158 + x00216 — anti-saturación: dedupe por root-cause y body con mensaje/explicación/log/razón
---

# f00158 — Auto-reporte de errores a GitHub + triage interno automático de issues

## Goal

Dos capacidades complementarias de "detección de incidencias casi sin querer":

1. **`@mcp-vertex/error-reporting`** (público, intrínseco): cualquier proyecto
   que cargue mcp-vertex detecta errores **del propio mcp-vertex** (no del
   proyecto host) y los reporta automáticamente a GitHub — creando una issue
   nueva en `CartagoGit/mcp-vertex` con detalle y log — por defecto encendido y
   desactivable por config.
2. **`@mcp-vertex/issues-triage`** (privado, solo uso interno): un bot de triage
   que lee las issues del repo, las analiza mecánicamente, genera una propuesta
   de arreglo completa y contesta en la misma issue según avances/hallazgos,
   marcando siempre que la respuesta es de una máquina automática.

## why

Los bugs de mcp-vertex solo se descubren hoy cuando un auditor los busca o un
adopter los reporta a mano. El primer plugin cierra el bucle (todo adopter es un
sensor); el segundo convierte ese flujo entrante en propuestas accionables sin
intervención humana.

## non-goals

- No reportar errores del proyecto host (solo errores cuyo stack/mensaje indica
  origen mcp-vertex).
- No embeber un LLM dentro del servidor MCP: el triage es análisis mecánico; el
  host decide qué ejecutar.
- No publicar `issues-triage` en npm: es interno del monorepo.

## Slices

- global_gate: type

### S1 — Plugin `error-reporting` (auto-reporte de errores)
- **Status**: done
- **Files**: `plugins/error-reporting/**`, `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/src/lib/plugins/plugin-defaults.ts`, `packages/cli/src/contracts/constants/plugin-defaults.constant.ts`, `packages/core/src/lib/registry/first-party-index.ts`, `tools/scripts/release/release-plan.ts`, `tsconfig.base.json`, `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "El plugin detecta tool-failed con origen mcp-vertex y crea una issue en el repo objetivo con título, stack, log y firma de deduplicación."
  - "El body de la issue incluye SIEMPRE: mensaje del error, explicación (contexto), log y razón/root-cause — no solo el stack."
  - "No reenvía el MISMO error ya reportado en ese proyecto: dedupe por la identidad del error (packageId + componentId + errorCode + frame interno), blindada para que no genere otra issue."
  - "Un mismo TIPO de error NO es el mismo error: bugs distintos que comparten errorCode pero difieren en ubicación no se mezclan. El MISMO error colapsa en UNA issue aunque los datos de runtime difieran (anti-saturación sin perder bugs)."
  - "Está en el preset `standard` (intrínseco) y en `vertex`; desactivable con `plugins.error-reporting.options.enabled = false`."
  - "Sin `gh`/auth/red falla silenciosamente (nunca rompe el boot)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Plugin `issues-triage` (bot interno, privado)
- **Status**: done
- **Files**: `plugins/issues-triage/**`, `tsconfig.base.json`, `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "`triage_list` descubre issues abiertas sin respuesta del bot; `triage_run` analiza y devuelve un borrador de propuesta completo; `triage_comment` comenta progreso."
  - "Todo comentario publicado lleva el aviso de máquina automática."
  - "No está en ningún preset ni en `PUBLISH_ORDER` ni en el índice first-party (`publishConfig.access: restricted`)."

## acceptance

- El auto-reporte crea issues con log completo y se puede desactivar.
- Cada issue incluye mensaje, explicación, log y razón/root-cause.
- La dedupe está blindada: el MISMO error (no el mismo tipo) no genera otra issue — colapsa en una única issue aunque los datos difieran; bugs distintos del mismo tipo no se mezclan (no saturar el repo).
- El triage interno analiza, propone y contesta marcando que es automático.
- Tests unitarios cubren firma/desdupe (mismo error con datos distintos → 1 issue; mismo tipo pero bug distinto → issues separadas), construcción de body, análisis y aviso de máquina.
- `bun run validate` sigue verde con ambos plugins wireados.
