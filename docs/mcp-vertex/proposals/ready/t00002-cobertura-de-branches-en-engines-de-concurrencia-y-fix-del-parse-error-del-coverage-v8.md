---
id: t00002
title: "Cobertura de branches en engines de concurrencia y fix del PARSE_ERROR del coverage V8"
kind: test
status: ready
type: proposal
track: tests
date: 2026-07-13
---

# t00002 — Cobertura de branches en engines de concurrencia y fix del PARSE_ERROR del coverage V8

## Goal

Subir la cobertura de branches (hoy 71.7% vs 84.9% de statements) atacando las ramas de error/recuperación de los engines de concurrencia — agent-lock-engine (562 LOC, 1 spec de 238 líneas), continuity-enforcer y zombie-reconcile — y eliminar el PARSE_ERROR del V8CoverageProvider que ensucia cada corrida de test:coverage identificando el archivo que no parsea.

## why

Finding 9 de a00053: las ramas menos testeadas son exactamente las que corren cuando algo ya va mal (corrupción, locks huérfanos, agentes muertos), y un error persistente en el output del coverage entrena a ignorarlo.

## non-goals

- Imponer umbral global de branches en CI (se decide con datos tras el slice)
- Reescribir los engines

## Slices

- global_gate: e2e

### S1 — Specs de ramas de error para agent-lock-engine (corrupción, re-claim, expiración, release huérfano)
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`
- **Gate**: e2e
- acceptance:
  - "branches de agent-lock-engine.ts por encima del 80% en el reporte v8"

### S2 — Specs de ramas de error para continuity-enforcer y zombie-reconcile
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/agents/continuity-enforcer.spec.ts`, `plugins/proposals/tests/src/lib/agents/zombie-reconcile.spec.ts`
- **Gate**: e2e
- acceptance:
  - "branches de ambos engines por encima del 80% en el reporte v8"

### S3 — Identificar y arreglar el archivo que revienta el V8CoverageProvider
- **Status**: pending
- **Files**: `vitest.shared.ts`
- **Gate**: e2e
- acceptance:
  - "bun run test:coverage termina sin PARSE_ERROR en el output"

## acceptance

- branches de agent-lock-engine.ts por encima del 80% en el reporte v8
- branches de ambos engines por encima del 80% en el reporte v8
- bun run test:coverage termina sin PARSE_ERROR en el output
