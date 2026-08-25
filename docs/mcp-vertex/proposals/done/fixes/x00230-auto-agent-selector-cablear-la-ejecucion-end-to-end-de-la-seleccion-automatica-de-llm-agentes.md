---
id: x00230
title: "auto-agent-selector: cablear la ejecución end-to-end de la selección automática de LLM/agentes"
kind: fix
status: done
type: proposal
track: product
date: 2026-08-24
---

# x00230 — auto-agent-selector: cablear la ejecución end-to-end de la selección automática de LLM/agentes

## Goal

Diagnosticar y corregir por qué la **selección automática de LLM/agentes** no funciona de extremo a extremo.

Parte del plan `q00003`. Referencia legada: §24 `auto-agent-selector` de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Evidencia observada (a reproducir antes de fijar):

1. `auto_run` es **plan-only**: devuelve una escalera (`ladder`) pero NO ejecuta. Su propia descripción dice "The selector plans; you execute each rung".
2. El ejecutor real `run-with-escalation.ts` está exportado en `public/index.ts` pero **no está cableado a ninguna tool** — es código muerto desde el punto de vista del usuario.
3. `auto_recommend` es advisory ("a recommendation, not a command. You decide.") — no ejecuta.
4. En `preset-catalog.ts` el plugin está marcado `hostOnly: true` (solo `full`/`vertex`), por lo que **no se carga** en `standard`/`minimal`/`swarm`.

Resultado: el selector descubre y ordena, pero la "selección automática" real (elegir un proveedor y ejecutar la tarea con escalación) nunca ocurre sin intervención manual. Objetivo: cablear `run-with-escalation` a una tool ejecutable (o modo `execute` en `auto_run`) delegando la invocación al provider vía `orchestrator-runner invoke` + gate de aceptación, y corregir la pertenencia a presets.

## why

El usuario reporta que la selección automática de LLM/agentes "no funciona". La causa raíz es estructural: el selector planifica pero nunca ejecuta (`run-with-escalation` muerto) y está excluido de los presets de uso normal. Sin ejecución real, la promesa de "elegir el modelo más rentable por tarea" no se cumple en la práctica.

## non-goals

- No reescribir discovery/ranking (funcionan; el fallo es el cableado de ejecución).
- No gastar dinero sin consentimiento: la ejecución sigue sujeta a cost ceiling y confirmación explícita.
- No cambiar la semántica advisory de auto_recommend (se mantiene como recomendación).
- No tocar la calibración/win-rates (f00127 ya cubre esa parte).

## Slices

- global_gate: type

### S1 — Reproducir y documentar el fallo
- **Status**: done
- **Files**: `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`
- **Gate**: type
- acceptance:
  - "Se reproduce auto_status/auto_recommend/auto_run en un entorno limpio y se documenta qué falta para que la selección ejecute."
  - "Se confirma que run-with-escalation no está cableado a ninguna tool."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Cablear la ejecución (escalación real)
- **Status**: done
- **Files**: `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`, `plugins/auto-agent-selector/src/lib/escalate/run-with-escalation.ts`
- **Gate**: type
- acceptance:
  - "auto_run (o una tool nueva auto_execute) ejecuta la escalera vía run-with-escalation con runProvider = orchestrator-runner invoke."
  - "checkAcceptance usa el gate de aceptación del proyecto; un rung que lanza escala al siguiente."
  - "El cost ceiling y el consentimiento explícito se respetan."

### S3 — Pertenencia a presets y tests e2e
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`
- **Gate**: type
- acceptance:
  - "auto-agent-selector deja de ser hostOnly donde corresponda (o se documenta por qué sigue siendo host-only)."
  - "Tests cubren selección+ejecución end-to-end con proveedor falso y escalación."

## acceptance

- Se reproduce auto_status/auto_recommend/auto_run en un entorno limpio y se documenta qué falta para que la selección ejecute.
- Se confirma que run-with-escalation no está cableado a ninguna tool.
- auto_run (o una tool nueva auto_execute) ejecuta la escalera vía run-with-escalation con runProvider = orchestrator-runner invoke.
- checkAcceptance usa el gate de aceptación del proyecto; un rung que lanza escala al siguiente.
- El cost ceiling y el consentimiento explícito se respetan.
- auto-agent-selector deja de ser hostOnly donde corresponda (o se documenta por qué sigue siendo host-only).
- Tests cubren selección+ejecución end-to-end con proveedor falso y escalación.
