---
id: x00264
title: "AUD-CP-006 — Threshold: medir y stagear el mismo conjunto de dirty files"
kind: fix
status: done
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00264"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-006
related:
    - q00006
    - t00019 # reproduce "predicate ≠ action"
    - x00263 # mismo patrón sliceScoping para staged
    - f00182 # engine central
shipped-in:
    - 2a5336110d29a11b02bc2196c12db85b0d51ed75 # fix(commit-policy): x00264 — threshold/interval stagean el mismo conjunto dirty
    - 5eca9d75180afe3e09cf03b5e18998189ae34345 # fix: preserve post-hook workspace corrections (trigger-types + spec)
    - 6ff19f8d707059b8732a21c7fed5a4f725a3ffbb # chore: sync threshold-tracker/trigger-types/spec final state
---

# x00264 — AUD-CP-006: threshold trigger debe devolver y stagear el mismo conjunto de dirty files

## Goal

El threshold trigger
(`plugins/commit-policy/src/lib/triggers/threshold-tracker.ts`)
hoy decide disparar cuando se cruza el umbral y luego el engine
ejecuta con `files: []` → `skipAdd: true` → stagea lo ajeno o
nada. Bug "predicate ≠ action": el predicado (umbral cruzado) es
correcto, pero la acción no honra el conjunto que disparó el
predicado.

Tras la corrección:

1. El trigger retorna `{ kind: 'threshold', files: [...] }` con
   los `paths` exactos que estaban dirty al cruzar el umbral.
2. El engine stagea esos mismos paths (vía `f00182`).
3. Verificación post-stage: `git diff --cached --name-only` ⊆
   `triggerEvent.files`.

### Comportamiento actual (BUG)

```
threshold=3, 4 dirty
  → trigger dispara
  → engine ejecuta con files: []
  → driver: skipAdd=true
  → commit con archivos no relacionados o vacío
```

### Comportamiento deseado

```
threshold=3, 3 dirty   → event.files = esos 3   → stagea esos 3
threshold=3, 4 dirty   → event.files = esos 4   → stagea esos 4
threshold=3, 2 dirty   → no event
staged ajenos previos   → NO entran en event.files
```

## Why

- El bug rompe la propiedad más básica del policy: "qué archivos
  cruzaron el umbral" debe coincidir con "qué archivos se
  commitean". Hoy difieren.
- `t00019` no puede verificar la propiedad sin esta corrección.
- Es el mismo patrón que `x00263`; resolver ambos garantiza que
  NINGÚN trigger automático entrega `files: []` implícito.

## Non-goals

- No añadir heurísticas avanzadas (e.g. grouping por tipo, debounce
  adaptativo); eso queda para Track U con event bus global.
- No cambiar el `interval-timer`; esa es `x00266`.
- No introducir `git status --porcelain` parsing custom: usar la
  utilidad ya presente en `git-extra.ts`.

## Architecture

### 1. Trigger devuelto tipado

```ts
// plugins/commit-policy/src/lib/triggers/trigger-types.ts (nuevo o extendido)
export interface ThresholdEvent {
  kind: 'threshold';
  threshold: number;
  files: string[];          // paths dirty al cruzar el umbral
  observedAt: string;       // ISO-8601
  triggerId: string;        // UUID
}
```

`threshold-tracker.ts` recalcula los dirty paths con `git status
--porcelain` justo en el momento del cruce (no cachear) y los mete
en `event.files`.

### 2. Routing por el engine

El engine (`f00182`) recibe `ThresholdEvent`, valida requireConventional,
llama al mismo `commit-driver.stageSlice()`-equivalente para
threshold (mismo helper refactorizado), verifica post-stage subset.

### 3. Edge cases

- `git status` falla → no event, log de error, retry.
- `files` quedó vacío entre el cruce y la entrega (otro agente
  stagé todo) → no commit, se considera ya consumido.
- Concurrent dirty de OTRO agente entra al subset → assertSubset
  falla → refusal `CROSS_AGENT_CONTAMINATION`.

## Slices

- global_gate: lint

### S1 — Trigger devuelve los dirty files exactos y el engine los stagea

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/triggers/threshold-tracker.ts`, `plugins/commit-policy/src/lib/triggers/trigger-types.ts`, `plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts`
- **Gate**: type
- **Dependency**: `f00182`
- acceptance:
  - "threshold=3, 2 dirty → no event"
  - "threshold=3, 3 dirty → event con esos 3 files"
  - "threshold=3, 4 dirty → event con los 4 files"
  - "staged ajenos no entran en event.files"
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier_peer
- review-log: requested_changes by delivery_verifier — Pedir cambios: el debounce debe distinguir dirty sets distintos con el mismo count; el contrato debe tipar explícitamente ThresholdEvent y documentar files para threshold; revertir o aislar cualquier cambio en interval-timer fuera del perímetro S1. Mantener casos 2/3/4 dirty, staged-only y rename.
- review-log: approved by delivery_verifier_peer
## acceptance

- `t00019` verde.
- `event.files === git diff --cached --name-only` post-stage.
- Cero eventos disparan con `files: []` salvo `SKIP_STAGE_EXPLICIT`
  configurado.
- `bun run lint` verde; `tsc --noEmit` verde.
- Debounce de `git status` opcional si el repo es grande (>5k files).
