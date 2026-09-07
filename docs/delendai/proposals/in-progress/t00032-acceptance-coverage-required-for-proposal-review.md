---
id: t00032
title: "Acceptance coverage required for proposal review"
kind: test
status: in-progress
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: a3379c9a-2125-432b-8f73-bd48ff3455a6
last-correlation-id: a3379c9a-2125-432b-8f73-bd48ff3455a6
last-transition-from: ready
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
- **Status**: pending
- **Files**: `plugins/proposals/src`, `plugins/proposals/tests`
- **Gate**: type
- acceptance:
  - "La aprobación exige una entrada por cada criterio declarado."
  - "Cada entrada incluye evidencia de implementación y prueba o justificación verificable."
  - "La aprobación falla cuando falta cobertura."
  - "Existen tests de cobertura completa y parcial."

## acceptance

- La aprobación exige una entrada por cada criterio declarado.
- Cada entrada incluye evidencia de implementación y prueba o justificación verificable.
- La aprobación falla cuando falta cobertura.
- Existen tests de cobertura completa y parcial.
