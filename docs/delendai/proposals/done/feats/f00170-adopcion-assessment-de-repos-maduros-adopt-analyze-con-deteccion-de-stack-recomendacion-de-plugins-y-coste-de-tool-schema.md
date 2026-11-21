---
id: f00170
title: "adopción: assessment de repos maduros (adopt --analyze) con detección de stack, recomendación de plugins y coste de tool-schema"
kind: feat
status: done
type: proposal
track: adoption
date: 2026-08-24
shipped-in:
  - c31af732 # chore(proposals): corregir Files de f00170 (rutas reales)
  - 6eb733af # chore(proposals): f00170 → review
  - c76050fe # feat(f00170): assessment de adopción read-only — detectores, recomendación y coste de tool-schema
---

# f00170 — adopción: assessment de repos maduros (adopt --analyze) con detección de stack, recomendación de plugins y coste de tool-schema

## Goal

Dotar a la adopción de un assessment de solo-lectura para repositorios existentes maduros, antes de escribir nada: detectar stack/package-manager/monorepo/estructura, scripts (comandos), test runner, proveedor de CI, convenciones de docs y comandos/archivos en conflicto con el scaffold; recomendar plugins individualmente (recommended / not-recommended) con rationale; estimar el coste de tool-schema de la superficie recomendada (reutilizando la medición de presupuestos de tokens); y listar conflictos + cambios exactos que adopt_project haría. Alimenta adopt_project (nuevo modo analyze) y el CLI mcpv adopt --analyze.

## why

La conversación señala como problema principal que adoptar Vertex en un repo maduro es un dolor de cabeza: hay que encadenar pasos y verificar a ciegas. f00157/f00110 ya orquestan la adopción en una llamada, pero no hacen assessment previo: hoy no se puede saber qué plugins convienen, qué conflictos habrá ni cuánto costará en tool-schema sin tocar el repo. Un assessment read-only reduce el coste marginal de integrar Vertex en el siguiente proyecto (de horas a minutos) y permite decidir antes de escribir.

## non-goals

- No reimplementar analyzeProject/deriveConfig/adopt_project: componerlos y extenderlos.
- No escribir nada en modo analyze (read-only, mismo contrato dry-run de adopt_project).
- No ejecutar red (gh/issues) sin consentimiento explícito.
- No decidir por el humano: solo recomendar, nunca aplicar.
- No reimplementar la medición de coste de tool-schema: reutilizar la de presupuestos (f00163/v00123).

## Slices

- global_gate: type

### S1 — Detectores de adopción (comandos, test runner, CI, docs y conflictos)
- **Status**: done
- **Files**: `packages/core/src/lib/bootstrap/analyze-project.ts`
- **Gate**: type
- acceptance:
  - "Detecta package-manager, scripts/comandos relevantes, test runner, proveedor de CI y convenciones de docs de forma pura y aditiva sobre IProjectAnalysis."
  - "Detecta comandos/archivos en conflicto con el scaffold del host (p. ej. un comando validate existente)."
  - "Los tests unitarios cubren un repo maduro TS monorepo y un repo no-TS."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: bug cli-ui-parity corregido; validate verde.
### S2 — Builder del assessment (recomendación por plugin, coste y conflictos)
- **Status**: done
- **Files**: `packages/core/src/lib/adopt/adoption-assessment.service.ts`, `packages/core/src/lib/contracts/interfaces/adoption-assessment.interface.ts`
- **Gate**: type
- acceptance:
  - "buildAdoptionAssessment es una función pura: análisis + topLevelDirs → matriz recommended/not-recommended por plugin con rationale de una línea."
  - "Estima el coste de tool-schema de la superficie recomendada reutilizando la medición de presupuestos existente."
  - "Lista conflictos y número de archivos que adopt_project cambiaría."

### S3 — Wiring: adopt_project (modo analyze) + CLI mcpv adopt --analyze
- **Status**: done
- **Files**: `packages/core/src/lib/adopt/adopt-project.tool.ts`, `packages/core/src/public/index.ts`, `packages/cli/src/commands/groups/core.ts`
- **Gate**: type
- acceptance:
  - "adopt_project devuelve el campo assessment (o un modo analyze) sin escribir."
  - "mcpv adopt --analyze renderiza el informe read-only sin tocar disco."
  - "bun run validate sigue verde con el nuevo contrato tipado."

## acceptance

- Detecta package-manager, scripts/comandos relevantes, test runner, proveedor de CI y convenciones de docs de forma pura y aditiva sobre IProjectAnalysis.
- Detecta comandos/archivos en conflicto con el scaffold del host (p. ej. un comando validate existente).
- Los tests unitarios cubren un repo maduro TS monorepo y un repo no-TS.
- buildAdoptionAssessment es una función pura: análisis + topLevelDirs → matriz recommended/not-recommended por plugin con rationale de una línea.
- Estima el coste de tool-schema de la superficie recomendada reutilizando la medición de presupuestos existente.
- Lista conflictos y número de archivos que adopt_project cambiaría.
- adopt_project devuelve el campo assessment (o un modo analyze) sin escribir.
- mcpv adopt --analyze renderiza el informe read-only sin tocar disco.
- bun run validate sigue verde con el nuevo contrato tipado.
