---
id: f00168
title: "optimizador adaptativo: bucle auto-optimización de modelo/plugin/prompt"
kind: feat
status: done
type: proposal
track: product
date: 2026-08-24
shipped-in:
  - 6b0521ed # chore(proposals): f00168 → review
  - 1ae4d4c4 # feat(f00168): plugin adaptive-optimizer — bucle de auto-optimización con scoring multiobjetivo
---

# f00168 — optimizador adaptativo: bucle auto-optimización de modelo/plugin/prompt

## Goal

Crear el optimizador adaptativo: un bucle que conecta prompt-eval, usage-tracking, perf, auto-agent-selector y auto-plugin-selector para optimizar automáticamente modelo/plugin/prompt/tool description.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §23 IDEA-006 — optimización adaptativa de modelo/plugin/prompt
- §9 TOK-012 — auto-selector sensible a coste (utility + relevance + confidence − tokenTax − latencyTax − permissionRisk)

Objetivo multiobjetivo: maximizar success, minimizar tokens/latencia/coste/permisos. Ejecuta experimentos automáticos sobre tool description, schema, plugin set, modelo y prompt, y aprende qué configuración funciona mejor.

## why

Ya existen las piezas (eval, usage, perf, selectores); falta el bucle que las cierre. Es la propuesta que convierte MCP Vertex de "un MCP con muchas tools" en una plataforma que se optimiza a sí misma.

## non-goals

- No gastar dinero sin techo: budget explícito y consentimiento.
- No reemplazar el control humano sobre el modelo/provider.
- No ejecutarse por defecto en repos ajenos sin configuración.

## Slices

- global_gate: type

### S1 — Plugin adaptive-optimizer (bucle de experimentos)
- **Status**: done
- **Files**: `plugins/adaptive-optimizer/src/lib/tools/optimize-run.tool.ts`
- **Gate**: type
- acceptance:
  - "Conecta prompt-eval/usage-tracking/perf/selectors."
  - "Optimiza success/tokens/latency/coste/permisos con budget y consentimiento explícitos."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Wiring del plugin
- **Status**: done
- **Files**: `plugins/adaptive-optimizer/src/index.ts`
- **Gate**: type
- acceptance:
  - "dependsOn los selectores y prompt-eval; tests del scoring multiobjetivo."

## acceptance

- Conecta prompt-eval/usage-tracking/perf/selectors.
- Optimiza success/tokens/latency/coste/permisos con budget y consentimiento explícitos.
- dependsOn los selectores y prompt-eval; tests del scoring multiobjetivo.
