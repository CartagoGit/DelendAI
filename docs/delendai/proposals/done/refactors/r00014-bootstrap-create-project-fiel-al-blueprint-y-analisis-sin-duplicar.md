---
id: r00014
title: "Bootstrap: create_project fiel al blueprint y análisis sin duplicar"
kind: refactor
status: done
type: proposal
track: bootstrap
date: 2026-08-23
---

# r00014 — Bootstrap: create_project fiel al blueprint y análisis sin duplicar

## Goal

Que `create_project` materialice fielmente el blueprint exhaustivo de `plan_mcp_project` (tools, prompts, skills, agents, tests, targetDir y estrategia de adopción) en lugar de re-generar un host genérico que pierde casi toda la información; eliminar el re-análisis del workspace entre `analyze_project` y `plan_mcp_project`; y hacer perezoso/compacto el payload `full` (~205 KB ≈ 51k tokens).

## why

Auditoría 2026-08-24 (hallazgos A4, A8, A9, A10 y el gasto de tokens): la cadena analyze_project → plan_mcp_project → create_project es lossy — planifica rico pero materializa pobre. Además analyze y plan re-analizan el workspace y el full de plan pesa ~205KB. Esto rompe la promesa de "MUY sencillo y barato en tokens" para un LLM que adopta el proyecto.

## non-goals

- No tocar scaffold-host (propuesta x00208).
- No tocar proposal_adopt/migrate-foreign.
- No cambiar el esquema de configuración mcp-vertex.config.json.

## Slices

- global_gate: type

### S1 — Esquema de create_project acepta el blueprint completo
- **Status**: done
- **Files**: `packages/core/src/lib/bootstrap/build-blueprint.ts`, `packages/core/src/lib/bootstrap/schemas.ts`
- **Gate**: type
- acceptance:
  - "El esquema de entrada de create_project acepta el blueprint completo (tools/prompts/skills/agents/tests) + targetDir + adoptionStrategy."
  - "No se rompe el contrato actual (back-compat de flags existentes)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. Revisado en profundidad. validate verde.
### S2 — create_project consume el blueprint fielmente
- **Status**: done
- **Files**: `packages/core/src/lib/bootstrap/create-tool.ts`
- **Gate**: type
- acceptance:
  - "create_project materializa exactamente lo que el blueprint declara (sin re-scaffold genérico)."
  - "Se preservan targetDir, tests, prompts, skills, agents y estrategia de adopción."

### S3 — Análisis compartido + payload perezoso + una sola estrategia mcp.json
- **Status**: done
- **Files**: `packages/core/src/lib/bootstrap/plan-tool.ts`, `packages/core/src/lib/bootstrap/recommend-plan.ts`, `packages/core/src/lib/bootstrap/analyze-tool.ts`
- **Gate**: type
- acceptance:
  - "analyze_project y plan_mcp_project comparten el análisis en una misma sesión (sin re-leer el workspace)."
  - "El payload full de plan_mcp_project se sirve por secciones/cursor o se reduce; nunca 205KB de una vez por defecto."
  - "Una sola estrategia de mcp.json en todo el flujo bootstrap."

### S4 — Tests del bootstrap
- **Status**: done
- **Files**: `packages/core/tests/src/lib/bootstrap/plan-tool.spec.ts`
- **Gate**: type
- acceptance:
  - "Specs del bootstrap cubren plan→create fiel y el payload perezoso."

## acceptance

- El esquema de entrada de create_project acepta el blueprint completo (tools/prompts/skills/agents/tests) + targetDir + adoptionStrategy.
- No se rompe el contrato actual (back-compat de flags existentes).
- create_project materializa exactamente lo que el blueprint declara (sin re-scaffold genérico).
- Se preservan targetDir, tests, prompts, skills, agents y estrategia de adopción.
- analyze_project y plan_mcp_project comparten el análisis en una misma sesión (sin re-leer el workspace).
- El payload full de plan_mcp_project se sirve por secciones/cursor o se reduce; nunca 205KB de una vez por defecto.
- Una sola estrategia de mcp.json en todo el flujo bootstrap.
- Specs del bootstrap cubren plan→create fiel y el payload perezoso.
