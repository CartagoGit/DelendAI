---
id: c00139
title: "Tier 1/2/3 jobs (feedback <1 min, PR, merge/nightly)"
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in:
    - f5836e9 # S1 workflows tier1/2/3 + budget enforcement
    section: "Track G / c00139"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00138 # affected CI (Tier 1 corre solo lo afectado)
    - x00268 # pack smoke (corre en Tier 1 o 2)
    - v00126 # verify CI local repro
---

# c00139 — Tier 1/2/3 jobs (feedback <1 min, PR, merge/nightly)

## Goal

Introducir **tres tiers** de jobs en CI con criterios de trigger y
presupuestos de tiempo diferentes:

- **Tier 1**: post-commit en cada push a una rama de PR. Solo lo
  afectado. Objetivo: feedback < 1 min.
- **Tier 2**: pre-merge del PR. Matriz completa. Objetivo: < 10 min.
- **Tier 3**: nightly / merge a `develop`. Batería extendida (e2e,
  pack smoke, security scans). Sin presupuesto duro.

### Comportamiento actual

- Existe un solo workflow que corre todo en cada push.
- El feedback loop es lento (matriz completa cada vez).
- La auditoría externa (§31) lo señala como cuello de botella y
  como causa de PRs que "todo verde local pero rojo en CI".

### Comportamiento deseado

- `.github/workflows/tier1.yml`:
  - Trigger: `pull_request` (opened, synchronize, reopened).
  - Llama al filtro affected de `c00138`.
  - Jobs: lint del paquete afectado + tests del paquete afectado.
  - Budget: < 1 min para un cambio en un plugin individual.
- `.github/workflows/tier2.yml`:
  - Trigger: `pull_request` cuando se marca como "ready for review"
    o label `tier2`.
  - Matriz completa.
  - Budget: < 10 min.
- `.github/workflows/tier3.yml`:
  - Trigger: `schedule: cron(0 3 * * *)` (nightly) +
    `push: branches: [develop]`.
  - Batería extendida: e2e, pack smoke (con `x00268`),
    `v00126`, security audits, capacity tests.
  - Sin budget duro.

## why

- Cierra §31 de la auditoría.
- Da feedback rápido (Tier 1) sin sacrificar cobertura (Tier 2/3).
- Reduce tiempo de revisión humana: el LLM y el humano saben en
  < 1 min si su cambio rompe algo del paquete tocado.
- Habilita el patrón "merge con Tier 1 + Tier 2 verdes, Tier 3
  posterior" — `develop` se mantiene verde y Tier 3 detecta
  regresiones más sutiles sin bloquear merges.

## non-goals

- No introduce auto-merge.
- No cambia los tests existentes; solo decide cuándo corren.
- No reemplaza el workflow principal actual — coexiste con él como
  tres workflows nombrados por tier.

## architecture

### 1. Estructura de cada workflow

```yaml
# tier1.yml
name: Tier 1 — fast feedback
on: { pull_request: { types: [opened, synchronize, reopened] } }
jobs:
  affected-lint:
    runs-on: ubuntu-latest
    timeout-minutes: 1
    steps:
      - uses: actions/checkout@v4
      - run: bun tools/scripts/ci/affected.script.ts …
      - run: bun run lint --filter $(cat .affected-set)
  affected-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - run: bun tools/scripts/ci/affected.script.ts …
      - run: bun vitest run --filter $(cat .affected-set)
```

### 2. Cache

- Cada tier cachea `node_modules` y `bun install` cache.
- Tier 1 usa cache caliente (más rápido).
- Tier 3 invalida cache para detectar cambios de comportamiento.

### 3. Tests

- `tools/scripts/ci/tier-budget.spec.ts`:
  - Mock del tiempo de ejecución; verifica que la suma de jobs de
    Tier 1 cabe en 60 segundos en condiciones normales.
- `tools/scripts/ci/tier-trigger.spec.ts`:
  - Verifica que los triggers de cada tier son los correctos.

## Slices

### S1 — Tres workflows + budget enforcement

- **Status**: done
- **Files**: `.github/workflows/tier1.yml`, `.github/workflows/tier2.yml`, `.github/workflows/tier3.yml`, `tools/scripts/ci/tier-budget.spec.ts`, `tools/scripts/ci/tier-trigger.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: tier-trigger.spec + tier-budget.spec 7/7 verde, typecheck tools limpio, workflows tier1/2/3 con triggers y budgets coherentes. Contrato del slice cumplido.
## acceptance

- Tres workflows existen y disparan en sus triggers.
- Tier 1 con un cambio de 1 archivo en un plugin completa en < 1
  min (medición documentada).
- Tier 2 corre la matriz completa.
- Tier 3 corre nightly + push a develop.
- Tests verdes.
- Branch protection (`c00130`) requiere Tier 1 + Tier 2 verdes
  antes de merge.
