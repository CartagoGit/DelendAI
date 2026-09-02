---
id: x00418
title: "Completar fixture de protección de ramas"
kind: fix
status: review
type: proposal
track: quality
date: 2026-09-02
last-transition-id: 214ea54d-6977-4ec3-8afe-64ee4598263f
last-correlation-id: 214ea54d-6977-4ec3-8afe-64ee4598263f
last-transition-from: in-progress
---

# x00418 — Completar fixture de protección de ramas

## Goal

Actualizar el fixture de verify-main-health para cumplir el contrato obligatorio de IDeclaredBranchRule y devolver el typecheck global a verde.

## why

El typecheck actual falla porque declaredPolicy() omite restrictions, ahora obligatorio en IDeclaredBranchRule.

## non-goals

- No cambiar la lógica de comparación de protección.
- No modificar el contrato para ocultar el error.
- No tocar archivos reclamados por f00414, r00033, r00034 o x00417.

## Slices

- global_gate: type

### S1 — Añadir restrictions al fixture
- **Status**: pending
- **Files**: `tools/scripts/ci/verify-main-health.spec.ts`
- **Gate**: type
- acceptance:
  - "El fixture cumple IDeclaredBranchRule con restrictions: null."
  - "El typecheck raíz pasa sin aumentar el baseline de errores."
  - "Las pruebas de verify-main-health siguen pasando."
- review-state: in_review
- review-implementer: x00418-branch-fixture-worker
## acceptance

- El fixture cumple IDeclaredBranchRule con restrictions: null.
- El typecheck raíz pasa sin aumentar el baseline de errores.
- Las pruebas de verify-main-health siguen pasando.
