---
id: d00005
title: "documentación: generación desde datos vivos y separación humano/generado"
kind: docs
status: done
type: proposal
track: ci-test-docs
date: 2026-08-24
shipped-in:
  - 7384fb17 # chore(proposals): d00005 → review
  - 03de8665 # docs(d00005): catálogo completo generado desde datos vivos + separar humano/generado
---

# d00005 — documentación: generación desde datos vivos y separación humano/generado

## Goal

Reducir la documentación mantenida manualmente y distinguir "documentación humana" de "datos generados".

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §20 DOC-001 — reducir información mantenida manualmente (generar tablas y catálogos)
- §20 DOC-004 — distinguir humana (visión/tutoriales/rationale/decisiones) de generado (versiones/plugins/presets/budgets/tool lists/capabilities/permissions)
- §20 DOC-005 + §27 SRC-001/002 — el código prioriza `why/invariante/riesgo`; el historial de bumps y cronología se mueve a ADR/proposal; ADR links compactos

La raíz del README representa solo una parte del catálogo (43 plugins reales). Se genera la lista completa (DOC-003) y se reduce la historia embebida en comentarios.

## why

La documentación es la principal fuente de drift actual: números y catálogos repetidos a mano se desincronizan del código. Generar lo derivable y reservar la prosa humana para visión y rationale elimina una clase entera de bugs.

## non-goals

- No borrar historia de propuestas (se mueve a ADR/proposal, no se elimina).
- No reescribir tutoriales humanos.
- No generar documentación a mano (siempre desde datos vivos).

## Slices

- global_gate: type

### S1 — Catálogo y tablas generados
- **Status**: done
- **Files**: `tools/scripts/docs/generate-catalog.script.ts`
- **Gate**: type
- acceptance:
  - "Genera la lista completa de plugins del README (DOC-003) y las tablas de versiones/presets/capabilities."
  - "La documentación generada no se edita a mano (DOC-001)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Separar humano de generado en docs
- **Status**: done
- **Files**: `README.md`
- **Gate**: lint
- acceptance:
  - "El README distingue explícitamente contenido humano (visión/rationale) de catálogo generado (DOC-004)."

### S3 — Comentarios de código: why sobre historia
- **Status**: done
- **Files**: `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
- **Gate**: lint
- acceptance:
  - "Los comentarios históricos largos se reducen a why/invariante/riesgo con ADR link compacto (SRC-001/002)."

## acceptance

- Genera la lista completa de plugins del README (DOC-003) y las tablas de versiones/presets/capabilities.
- La documentación generada no se edita a mano (DOC-001).
- El README distingue explícitamente contenido humano (visión/rationale) de catálogo generado (DOC-004).
- Los comentarios históricos largos se reducen a why/invariante/riesgo con ADR link compacto (SRC-001/002).
