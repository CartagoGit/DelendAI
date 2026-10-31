---
id: f00169
title: "impact_analyze y tests_for_change: análisis de impacto y selección de tests"
kind: feat
status: done
type: proposal
track: product
date: 2026-08-24
shipped-in:
  - 88a791a3 # chore(proposals): f00169 → review
  - 832f5674 # feat(f00169): plugin impact-analysis — impact_analyze y tests_for_change
---

# f00169 — impact_analyze y tests_for_change: análisis de impacto y selección de tests

## Goal

Crear `impact_analyze` y `tests_for_change`: análisis de impacto de cambios y selección inteligente de tests relevantes.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §23 IDEA-002 — `impact_analyze` (`{ changedSymbols, dependents, affectedPackages, recommendedTests, risk }`)
- §23 IDEA-003 — `tests_for_change` (qué tests ejecutar, cuáles no, qué cobertura importa, qué failures probablemente relacionados)

Encaja con search, refactor, git, quality y test-policy. En un monorepo grande ahorra tiempo y tokens al no ejecutar toda la suite.

## why

Ejecutar toda la suite en un monorepo grande quema tiempo y tokens. Saber qué toca un cambio y qué tests lo cubren es de las mayores palancas de eficiencia para agentes que modifican código.

## non-goals

- No sustituir el test runner (solo selecciona).
- No garantizar precisión perfecta de dependencias (es heurística documentada).
- No ejecutar tests por su cuenta sin policy.

## Slices

- global_gate: type

### S1 — Plugin impact-analysis (analyze + tests_for_change)
- **Status**: done
- **Files**: `plugins/impact-analysis/src/lib/tools/impact-analyze.tool.ts`, `plugins/impact-analysis/src/lib/tools/tests-for-change.tool.ts`
- **Gate**: type
- acceptance:
  - "impact_analyze devuelve changedSymbols/dependents/affectedPackages/recommendedTests/risk."
  - "tests_for_change selecciona tests relevantes y descarta los irrelevantes."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Wiring del plugin
- **Status**: done
- **Files**: `plugins/impact-analysis/src/index.ts`
- **Gate**: type
- acceptance:
  - "Integrado con search/refactor/git/test-policy vía dependsOn."

## acceptance

- impact_analyze devuelve changedSymbols/dependents/affectedPackages/recommendedTests/risk.
- tests_for_change selecciona tests relevantes y descarta los irrelevantes.
- Integrado con search/refactor/git/test-policy vía dependsOn.
