---
id: f00511
title: "F3 — ETA Engine: cálculo puramente estadístico (mediana + p80, sin ML) sobre duración histórica local, con vector de características por hash canónico"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-06
parent-plan: q00020
depends-on:
    - f00510
cascadeBoost: 1
tags:
    - work-telemetry
    - eta
    - statistics
    - non-ml
---

# f00511 — F3 — ETA Engine: cálculo puramente estadístico (mediana + p80, sin ML) sobre duración histórica local, con vector de características por hash canónico

## Goal

Calcular la **estimación de tiempo restante** (ETA) para cada `(slice, agent_profile)` a partir de la duración histórica de slices análogos, sin ML ni embeddings. La ETA se modela como `eta: { p50, p80, range }` y se materializa en `progress_snapshots` junto a la confidence y la incertidumbre que ya entrega `f00510`. Cuando el histórico es insuficiente (<5 muestras para la combinación `(feature_vector_hash, actor_profile)`), la ETA devuelve `null` con `reason: 'insufficient_history'` y la UI renderiza `~?`.

## why

El progreso sin ETA es sólo "lo que pasó". El usuario quiere "cuánto le falta". La conversación con ChatGPT del 2026-09-06 cerró la discusión sobre cómo hacerlo: **estadística local sobre eventos propios**, sin llamadas a un LLM, sin embeddings. La razón es doble: (1) DelendAI ya acumula duración de slices reales en `duration_history` si F1/F2 están corriendo, así que el histórico se construye orgánicamente; (2) un predictor aprendido fuera del repo no puede mejorar sobre el histórico local porque no conoce el working set, el agente ni la fase. La condición "ETA inicial ruidosa ⇒ mostrar `~?`" protege al usuario de un número falso durante las primeras sesiones.

## non-goals

- Calcular la duración real de un slice en curso. Eso es `Date.now() − claim_started_at` y lo cubre `f00510` S5 (`subscribe` ya entrega el snapshot incremental).
- Inventar embeddings o modelos. El vector de características es un objeto plano `{ slice_count, affected_packages, public_api_changes, test_count, loc_changed, complexity_proxy }` que se serializa canónicamente y se hashea con sha256.
- Re-entrenar el histórico al cierre de cada slice. El insert en `duration_history` se hace en el `proposal_transition → done`, no en un job batch; mantenerlo así evita race conditions con el GC del bus.
- Cross-project learning. La ETA vive en `.cache/delendai/telemetry/` del proyecto; cross-project es un proposal aparte que puede apoyarse en `usage-tracking` o `memory` si la propuesta dueña lo decide.

## Slices

- global_gate: type

### F3-S1 — `feature-vector.ts` — vector canónico {slice_count, affected_packages, public_api_changes, test_count, loc_changed, complexity_proxy} + sha256
- **Status**: pending
- **Files**: `packages/state-telemetry/src/lib/eta/feature-vector.ts`, `packages/state-telemetry/src/lib/eta/feature-vector.spec.ts`
- **Gate**: type
- acceptance:
  - "`computeFeatureVector(proposal, slice, workItem, snapshot)` devuelve `IWorkFeatureVector` con los 6 campos documentados y un método `canonicalHash(): string` estable byte-a-byte."
  - "Dos propuestas distintas con los mismos 6 campos producen el mismo hash; cambiar 1 campo cambia el hash."
  - "`complexity_proxy` se calcula como `slice_count × 1.2 + affected_packages × 2.1 + public_api_changes × 3.2 + test_count × 0.7 + loc_changed × 0.0001`, redondeado a 2 decimales."
  - "Test de estabilidad: para 100 propuestas sintéticas con vectores aleatorios, el hash es único y el cálculo es independiente del orden de los campos del input."

### F3-S2 — `duration-history.ts` — tabla `duration_history` (feature_vector_hash, actor_profile, task_kind, duration_ms, outcome) + insert desde `proposal_transition → done`
- **Status**: pending
- **DependsOn**: [F3-S1]
- **Files**: `packages/state-telemetry/src/lib/eta/duration-history.ts`, `packages/state-telemetry/src/lib/eta/duration-history.spec.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.duration-history.spec.ts`
- **Gate**: type
- acceptance:
  - "Tabla `duration_history` creada con la PK compuesta `(feature_vector_hash, actor_profile, task_kind)`."
  - "`recordDuration(vector, actor, kind, durationMs, outcome)` se invoca desde `proposal-transition.tool.ts` cuando `to === 'done'` o `to === 'review'`; sin await en el camino crítico (se ejecuta en background tras el `await writeFileAtomic(frontmatter)`)."
  - "Una transición `done` para un slice con `outcome: 'blocked'` no se inserta (sólo `outcome ∈ {done, review}` cuentan)."
  - "Test: simular 10 transiciones a `done` con vectores distintos produce 10 filas; una undécima con el mismo `(vector, actor, kind)` se acumula en un buffer interno y se inserta como nueva fila sólo si la mediana cambia >5%."

### F3-S3 — `eta-engine.ts` — cálculo de mediana + p80 por `(feature_vector_hash, actor_profile)`; fallback a `task_kind` global si la combinación específica tiene <5 muestras
- **Status**: pending
- **DependsOn**: [F3-S2]
- **Files**: `packages/state-telemetry/src/lib/eta/eta-engine.ts`, `packages/state-telemetry/src/lib/eta/eta-engine.spec.ts`, `packages/state-telemetry/src/lib/eta/eta-aggregation.ts`, `packages/state-telemetry/src/lib/eta/eta-aggregation.spec.ts`
- **Gate**: type
- acceptance:
  - "`computeEta(featureVector, actorProfile, taskKind, observedMs)` devuelve `{ p50: number, p80: number, range: [number, number], sampleSize: number }` o `null` con `reason: 'insufficient_history'` si `sampleSize < 5`."
  - "La agregación por `(vector, actor)` usa el percentil p80 (no la media) para absorber outliers sin inflar el rango."
  - "Si `(vector, actor)` tiene <5 muestras pero `(taskKind, actor)` tiene ≥5, se devuelve la ETA agregada por task_kind con `confidence: 0.6` (vs 0.9 del caso específico)."
  - "Test con fixture `tests/fixtures/eta-fixtures.spec.ts` (≥50 muestras sintéticas): la mediana de error de p50 sobre el dataset es ≤35%."
  - "`computeEta` no es un productor del State Engine — es una función pura invocada por `f00510` S5 al construir el snapshot. Esto evita meter cálculo en el `rebuild`/`reconcile`."

### F3-S4 — Integración con `f00510` — `progress_snapshots` gana campos `eta_p50_ms`, `eta_p80_ms`, `eta_reason`; sin llamada a LLM
- **Status**: pending
- **DependsOn**: [F3-S3]
- **Files**: `packages/state-telemetry/src/lib/projector/work-progress-producer.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.ts`, `packages/state-telemetry/src/lib/projector/integration-with-eta.ts`, `packages/state-telemetry/tests/integration/eta-integration.spec.ts`
- **Gate**: type
- acceptance:
  - "`progress_snapshots` schema extendido con `eta_p50_ms INTEGER`, `eta_p80_ms INTEGER` (NULL cuando `eta: null`) y `eta_reason TEXT` (`'insufficient_history'` | `'computed'`)."
  - "El producer llama a `computeEta` UNA vez por snapshot, en `reconcile` (no en `rebuild`, para no recalcular al rehidratar)."
  - "El test `tests/integration/telemetry-no-tokens.spec.ts` (acceptance del plan) demuestra que pintar un snapshot con ETA no añade tokens al LLM."
  - "`f00504` (Progress Watchdog) puede consumir `eta_p80_ms` para distinguir “stalled pero cerca de terminar” de “stalled al 5%”: tests de integración demuestran que el watchdog cambia su decisión en función de la ETA."

## acceptance

- `computeFeatureVector(proposal, slice, workItem, snapshot)` devuelve `IWorkFeatureVector` con los 6 campos documentados y un método `canonicalHash(): string` estable byte-a-byte.
- Dos propuestas distintas con los mismos 6 campos producen el mismo hash; cambiar 1 campo cambia el hash.
- `complexity_proxy` se calcula como `slice_count × 1.2 + affected_packages × 2.1 + public_api_changes × 3.2 + test_count × 0.7 + loc_changed × 0.0001`, redondeado a 2 decimales.
- Test de estabilidad: para 100 propuestas sintéticas con vectores aleatorios, el hash es único y el cálculo es independiente del orden de los campos del input.
- Tabla `duration_history` creada con la PK compuesta `(feature_vector_hash, actor_profile, task_kind)`.
- `recordDuration(vector, actor, kind, durationMs, outcome)` se invoca desde `proposal-transition.tool.ts` cuando `to === 'done'` o `to === 'review'`; sin await en el camino crítico (se ejecuta en background tras el `await writeFileAtomic(frontmatter)`).
- Una transición `done` para un slice con `outcome: 'blocked'` no se inserta (sólo `outcome ∈ {done, review}` cuentan).
- Test: simular 10 transiciones a `done` con vectores distintos produce 10 filas; una undécima con el mismo `(vector, actor, kind)` se acumula en un buffer interno y se inserta como nueva fila sólo si la mediana cambia >5%.
- `computeEta(featureVector, actorProfile, taskKind, observedMs)` devuelve `{ p50: number, p80: number, range: [number, number], sampleSize: number }` o `null` con `reason: 'insufficient_history'` si `sampleSize < 5`.
- La agregación por `(vector, actor)` usa el percentil p80 (no la media) para absorber outliers sin inflar el rango.
- Si `(vector, actor)` tiene <5 muestras pero `(taskKind, actor)` tiene ≥5, se devuelve la ETA agregada por task_kind con `confidence: 0.6` (vs 0.9 del caso específico).
- Test con fixture `tests/fixtures/eta-fixtures.spec.ts` (≥50 muestras sintéticas): la mediana de error de p50 sobre el dataset es ≤35%.
- `computeEta` no es un productor del State Engine — es una función pura invocada por `f00510` S5 al construir el snapshot. Esto evita meter cálculo en el `rebuild`/`reconcile`.
- `progress_snapshots` schema extendido con `eta_p50_ms INTEGER`, `eta_p80_ms INTEGER` (NULL cuando `eta: null`) y `eta_reason TEXT` (`'insufficient_history'` | `'computed'`).
- El producer llama a `computeEta` UNA vez por snapshot, en `reconcile` (no en `rebuild`, para no recalcular al rehidratar).
- El test `tests/integration/telemetry-no-tokens.spec.ts` (acceptance del plan) demuestra que pintar un snapshot con ETA no añade tokens al LLM.
- `f00504` (Progress Watchdog) puede consumir `eta_p80_ms` para distinguir “stalled pero cerca de terminar” de “stalled al 5%”: tests de integración demuestran que el watchdog cambia su decisión en función de la ETA.
