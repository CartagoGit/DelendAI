---
id: t00006
title: "coverage: exclusión selectiva de index.ts, apps/web y property-based tests"
kind: test
status: done
type: proposal
track: ci-test-docs
date: 2026-08-24
---

# t00006 — coverage: exclusión selectiva de index.ts, apps/web y property-based tests

## Goal

Mejorar la cobertura real: revisar la exclusión global de `index.ts`, dar cobertura a `apps/web` y añadir tests de plugin lifecycle y property-based.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §19 TEST-001 — revisar exclusión global de `index.ts` (mucho wiring real vive ahí; excluir barrels por detección, no todos)
- §19 TEST-002 — coverage de apps/web (tests de lógica TS, Playwright, component tests, build snapshots)
- §19 TEST-003 — tests de plugin lifecycle (dependency fail, register timeout/abort, partial registration, dispose fail, cycle, duplicate, transformed options)
- §19 TEST-004 — property-based tests para paths y redaction (containment, redactor, privacy validator, truncation, parsers)

Los umbrales actuales (statements 80, branches 67, functions 79, lines 81) no reflejan la superficie comportamental real porque excluyen `**/index.ts` y `apps/web`.

## why

80% de coverage no equivale a 80% de superficie comportamental si el wiring real (index.ts) y apps/web están excluidos. Excluir barrels por detección y cubrir web y redaction hace la métrica representativa.

## non-goals

- No bajar los umbrales de cobertura para hacer pasar tests.
- No reescribir la config de V8/Astro si no aporta.
- No duplicar los tests de lifecycle ya cubiertos por las propuestas de loader.

## Slices

- global_gate: type

### S1 — Exclusión de barrels por detección
- **Status**: done
- **Files**: `vitest.config.ts`
- **Gate**: type
- acceptance:
  - "Solo se excluyen barrels puros por detección, no todos los index.ts (TEST-001)."
  - "El wiring real (options/register/hooks/knowledge) queda cubierto."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde.
### S2 — Cobertura de apps/web
- **Status**: done
- **Files**: `apps/web/vitest.config.ts`
- **Gate**: type
- acceptance:
  - "Tests de lógica TS + component tests + build snapshots para apps/web (TEST-002)."

### S3 — Property-based tests de paths y redaction
- **Status**: done
- **Files**: `tools/tests/property-based.spec.ts`
- **Gate**: type
- acceptance:
  - "Property-based para containment, redactor, privacy validator y truncation (TEST-004)."

## acceptance

- Solo se excluyen barrels puros por detección, no todos los index.ts (TEST-001).
- El wiring real (options/register/hooks/knowledge) queda cubierto.
- Tests de lógica TS + component tests + build snapshots para apps/web (TEST-002).
- Property-based para containment, redactor, privacy validator y truncation (TEST-004).
