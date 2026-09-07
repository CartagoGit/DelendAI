---
id: t00032
title: "Acceptance coverage required for proposal review"
kind: test
status: review
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 02678cdb-2c9a-4ff2-8ef4-28534d957eda
last-correlation-id: 02678cdb-2c9a-4ff2-8ef4-28534d957eda
last-transition-from: in-progress
---

# t00032 — Acceptance coverage required for proposal review

## Goal

Exigir evidencia concreta para cada criterio de aceptación antes de aprobar una slice, evitando aprobaciones basadas únicamente en suites generales.

## why

La review de x00521 quedó aprobada pese a que varios criterios explícitos no estaban implementados.

## non-goals

- No rehacer automáticamente proposals históricas.
- No sustituir los gates existentes de lint, type o e2e.

## Slices

- global_gate: type

### S1 — Validar cobertura de acceptance criteria en reviews
- **Status**: done
- **Files**: `plugins/proposals/src`, `plugins/proposals/tests`
- **Gate**: type
- acceptance:
  - "La aprobación exige una entrada por cada criterio declarado."
  - "Cada entrada incluye evidencia de implementación y prueba o justificación verificable."
  - "La aprobación falla cuando falta cobertura."
  - "Existen tests de cobertura completa y parcial."
- review-state: done
- review-implementer: github-copilot
- review-reviewer: orchestrator
- review-log: approved by orchestrator — Revisión independiente completada: la cobertura parcial falla y la cobertura completa aprueba; commit efe99d543 publicado; typecheck del plugin y 9/9 tests focalizados pasan.
## acceptance

- La aprobación exige una entrada por cada criterio declarado.
- Cada entrada incluye evidencia de implementación y prueba o justificación verificable.
- La aprobación falla cuando falta cobertura.
- Existen tests de cobertura completa y parcial.
