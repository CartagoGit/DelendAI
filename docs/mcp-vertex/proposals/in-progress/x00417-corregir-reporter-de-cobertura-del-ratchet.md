---
id: x00417
title: "Corregir reporter de cobertura del ratchet"
kind: fix
status: in-progress
type: proposal
track: quality
date: 2026-09-02
last-transition-id: d3e89155-95c3-4f34-8d77-6656ae3a1227
last-correlation-id: d3e89155-95c3-4f34-8d77-6656ae3a1227
last-transition-from: ready
---

# x00417 — Corregir reporter de cobertura del ratchet

## Goal

Hacer que coverage:ratchet genere coverage-summary.json con la opción de cobertura soportada por Vitest 4 y mantener coherentes la documentación y las pruebas del script.

## why

El gate actual falla antes de ejecutar tests porque usa --reporter=json-summary; Vitest 4 requiere --coverage.reporter=json-summary.

## non-goals

- No cambiar umbrales de cobertura.
- No reabrir t00030.
- No tocar configuraciones de los lanes f00414 o r00033.

## Slices

- global_gate: type

### S1 — Corregir comando y documentación del ratchet
- **Status**: pending
- **Files**: `package.json`, `tools/scripts/coverage-ratchet.script.ts`, `tools/scripts/coverage-ratchet.script.spec.ts`, `docs/mcp-vertex/proposals/done/tests/t00030-cobertura-apretar-los-umbrales-al-valor-real-branches-80-en-core-plugins-core-dry-run-y-core-project.md`
- **Gate**: type
- acceptance:
  - "coverage:ratchet usa --coverage.reporter=json-summary."
  - "El script y sus pruebas describen y verifican la forma correcta."
  - "El gate deja de fallar por resolución de json-summary."
- review-state: in_review
- review-implementer: x00417-coverage-ratchet-worker
## acceptance

- coverage:ratchet usa --coverage.reporter=json-summary.
- El script y sus pruebas describen y verifican la forma correcta.
- El gate deja de fallar por resolución de json-summary.
