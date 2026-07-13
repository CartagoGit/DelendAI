---
id: x00101
title: "Token-lean por defecto: plan_mcp_project y analyze_project compact-first, rules_get_rules compact, budgets e2e"
kind: fix
status: ready
type: proposal
track: core
date: 2026-07-13
---

# x00101 — Token-lean por defecto: plan_mcp_project y analyze_project compact-first, rules_get_rules compact, budgets e2e

## Goal

Que ninguna llamada sin argumentos a un tool público devuelva payloads que rompan el presupuesto de contexto de un LLM: plan_mcp_project pasa de 205.963 B (~51k tokens) a su resumen compacto (~900 B) por defecto con full:true opt-in, analyze_project igual (12.933 B → 873 B), rules_get_rules gana modo compacto (hoy 12.318 B sin alternativa), y los tres quedan protegidos por presupuestos e2e en token-budget.e2e.spec.ts más el gate de métricas. TOKEN-BUDGETS.md se refresca para reflejar los gates reales (overview compact 1200, agent_catalog 900, los nuevos).

## why

Finding 1 y 11 de a00053 (re-verificación del finding diferido de a00052): el modo compacto existe pero es opt-in, así que la llamada ingenua — la que hace cualquier LLM que descubre el tool — consume un cuarto del contexto de un modelo de 200k. Contradice la promesa low-token que el resto del proyecto sí cumple.

## non-goals

- Cambiar el contenido del blueprint o del análisis (solo el default de proyección)
- Tocar la generación de archivos del scaffold
- Publicar en npm

## Slices

- global_gate: e2e

### S1 — plan_mcp_project y analyze_project compact por defecto con full:true opt-in + SDK regenerado
- **Status**: pending
- **Files**: `packages/core/src/lib/bootstrap/plan-tool.ts`, `packages/core/src/lib/bootstrap/analyze-tool.ts`, `packages/core/src/generated/tool-outputs.ts`
- **Gate**: e2e
- acceptance:
  - "plan_mcp_project {} devuelve el resumen compacto (<2 KB) y full:true el blueprint completo"
  - "analyze_project {} devuelve <2 KB y full:true el análisis completo"
  - "las descripciones de ambos tools documentan el default y el opt-in"

### S2 — rules_get_rules modo compact
- **Status**: pending
- **Files**: `plugins/rules/src/lib/tools/rules-tools.ts`
- **Gate**: e2e
- acceptance:
  - "get_rules {compact:true} devuelve ids+resumen por familia sin los cuerpos completos"
  - "el default queda documentado en la descripción del tool"

### S3 — Presupuestos e2e para plan/analyze/get_rules + refresh de TOKEN-BUDGETS.md + baseline de métricas
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`, `tools/scripts/metrics/collect-candidate.script.ts`, `config/metrics-baseline.json`
- **Gate**: e2e
- acceptance:
  - "token-budget.e2e.spec.ts falla si plan/analyze/get_rules default superan su budget"
  - "TOKEN-BUDGETS.md refleja los budgets vigentes del e2e (overview 1200, agent_catalog 900, los nuevos)"
  - "collect-candidate trackea plan_mcp_project y analyze_project"

## acceptance

- plan_mcp_project {} devuelve el resumen compacto (<2 KB) y full:true el blueprint completo
- analyze_project {} devuelve <2 KB y full:true el análisis completo
- las descripciones de ambos tools documentan el default y el opt-in
- get_rules {compact:true} devuelve ids+resumen por familia sin los cuerpos completos
- el default queda documentado en la descripción del tool
- token-budget.e2e.spec.ts falla si plan/analyze/get_rules default superan su budget
- TOKEN-BUDGETS.md refleja los budgets vigentes del e2e (overview 1200, agent_catalog 900, los nuevos)
- collect-candidate trackea plan_mcp_project y analyze_project
