---
id: f00510
title: "F2 — Progress Projector: IStateProducer determinista que infiere fase, progreso ponderado, confianza, incertidumbre y stalled sin gastar tokens"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-06
parent-plan: q00020
depends-on:
    - q00019
    - f00509
cascadeBoost: 1
tags:
    - work-telemetry
    - state-engine
    - projector
    - non-llm
---

# f00510 — F2 — Progress Projector: IStateProducer determinista que infiere fase, progreso ponderado, confianza, incertidumbre y stalled sin gastar tokens

## Goal

Convertir el stream `work_events` (entregado por `f00509`) en una **proyección determinista del progreso** — `progress_snapshots` con fase (`WorkPhase` enum cerrada), progreso ponderado por `weight`, `confidence`, `uncertainty` y `stalled`. Esta propuesta implementa el productor como un `IStateProducer` del State Engine (`packages/state/src/lib/producer.ts`), por lo que hereda automáticamente la propiedad `incremental === cleanRebuild` y la verificación del `parity sampler` de `q00019`. **Cero llamadas al LLM**: la fase y el progreso son aritmética sobre los eventos observados.

## why

El bus de eventos de F1 entrega el "qué pasó". Lo que falta es el "qué significa eso para el progreso del slice". Hoy esa inferencia no existe: un humano o el LLM tiene que adivinar si el agente está investigando, implementando o testeando. La consecuencia práctica es que `f00504` (Progress Watchdog) opera a ciegas — sólo detecta bucles sin saber en qué fase está el bucle — y `f00277` (AgentSession) muestra una foto sin continuidad. La conversación con ChatGPT del 2026-09-06 lo llamó "Progress Projector" y este slice lo aterriza como un productor más del State Engine, no como un subsistema paralelo. Eso garantiza que el `parity_sampler` de `q00019` verifique que la sombra SQLite y la memoria ven la misma proyección — exactamente la misma garantía que el resto del State Engine ya tiene.

## non-goals

- Calcular ETA. La estimación de tiempo restante vive en `f00511` (ETA Engine) y se compone contra este snapshot.
- Renderizar UI. Esta propuesta sólo expone la API (`getSnapshot`, `getSnapshotsForProposal`, `subscribe`); las vistas (CLI, extensión, chat) son `f00512`.
- Inventar la enumeración de fases. Las 10 fases (`investigating | designing | implementing | testing | fixing | validating | reviewing | reconciling | done | blocked`) están fijadas en `q00020` y este slice las consume como dato, no como constante embebida.
- Recomputar fases a partir de eventos remotos. Este slice sólo lee del `work_events` local; la sincronización entre hosts es responsabilidad del State Engine y de `q00019` Phase 2 (cuando SQLite pase a primary).

## Slices

- global_gate: type

### F2-S1 — `IWorkProgressProducer` + tabla `progress_snapshots` (un IStateProducer real)
- **Status**: pending
- **DependsOn**: [f00509]
- **Files**: `packages/state-telemetry/src/lib/projector/work-progress-producer.ts`, `packages/state-telemetry/src/lib/projector/work-progress-producer.spec.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.spec.ts`, `packages/state-telemetry/src/lib/projector/index.ts`, `tools/scripts/lint/state-telemetry-purity.script.ts` (única slice que crea la lint de pureza para `packages/state-telemetry/src/**`; F1-S1 y el resto sólo la consumen vía `bun run lint`)
- **Gate**: type
- acceptance:
  - "`IWorkProgressProducer implements IStateProducer` declarado con `id: 'work-progress'` y `inputs: [IProducerInputSpec<'work_events'>, IProducerInputSpec<'work_items'>, IProducerInputSpec<'work_assignments'>]`."
  - "`rebuild(scope)` produce el snapshot canónico en orden estable (mismo orden con mismos eventos); `reconcile(scope, delta)` actualiza sólo las filas afectadas."
  - "Property test `incremental === cleanRebuild` verde sobre 1000 secuencias aleatorias de eventos sintéticos (heredado del State Engine, sin reescribir)."
  - "La fila `progress_snapshots.stalled = 1` se materializa cuando se detecta el patrón `^k con misma failure_hash ∧ k ≥ 3` (umbral configurable, default 3)."
  - "`tools/scripts/lint/state-telemetry-purity.script.ts` cubre `packages/state-telemetry/src/lib/projector/**` y rechaza cualquier `await` dentro de `rebuild`/`reconcile`."

### F2-S2 — `phase-inference.ts` — tabla declarativa read→investigating, edit→implementing, test→testing, fix→fixing, validate→validating, review→reviewing, push→reconciling
- **Status**: pending
- **DependsOn**: [F2-S1]
- **Files**: `packages/state-telemetry/src/lib/projector/phase-inference.ts`, `packages/state-telemetry/src/lib/projector/phase-inference.spec.ts`, `packages/state-telemetry/src/lib/projector/phase-rules.ts`
- **Gate**: type
- acceptance:
  - "`phase-rules.ts` exporta un array de `PhaseRule` (declarativo, no lógica embebida) que cualquier propuesta posterior puede extender sin tocar el projector."
  - "El default de la tabla mapea los 9 casos no-terminales descritos en `q00020` (read/search → investigating; write de código → implementing; test_started → testing; test_finished{exit≠0} seguido de write → fixing; validate_started sin write → validating; diff_self → reviewing; git_push → reconciling; claim sin eventos → investigating)."
  - "Test con dataset sintético `tests/fixtures/phase-inference-fixtures.spec.ts` con ≥30 secuencias etiquetadas a mano; acierto ≥95% (los 5%，允许 son los `ambiguous` que el modelo marca como `confidence: 0.5`)."
  - "El cambio de fase es **monótono hacia adelante** dentro de la ventana de observación (no se rebobina a `investigating` si el último evento fue `implementing`)."

### F2-S3 — `confidence-model.ts` — confidence + uncertainty derivados de la varianza de los últimos N eventos y de la completitud del `work_items.acceptance_criteria`
- **Status**: pending
- **DependsOn**: [F2-S1]
- **Files**: `packages/state-telemetry/src/lib/projector/confidence-model.ts`, `packages/state-telemetry/src/lib/projector/confidence-model.spec.ts`
- **Gate**: type
- acceptance:
  - "`confidence` ∈ [0, 1] calculado como `1 − varianza_normalizada(últimos 10 eventos)` con cap por completitud de acceptance: si 0/5 criterios marcados → cap=0.5; si 5/5 → cap=1."
  - "`uncertainty = 1 − confidence` por invariante explícita (`tests/property/uncertainty-invariance.spec.ts` lo verifica)."
  - "El test `confidence-fixtures.spec.ts` cubre 12 escenarios: 0 eventos (confidence=0, uncertainty=1), 10 eventos coherentes (confidence≈0.95), 10 eventos con 7 cambios de fase (confidence≈0.6), etc."
  - "La confidence se incluye SIEMPRE en el snapshot (no es opcional), para que `f00512` la pueda mostrar al lado del porcentaje."

### F2-S4 — `progress-weighting.ts` — Σ(completion × weight) / Σ(weight), con pesos por defecto derivados de la posición de la slice en la proposal y override opcional en frontmatter
- **Status**: pending
- **DependsOn**: [F2-S1]
- **Files**: `packages/state-telemetry/src/lib/projector/progress-weighting.ts`, `packages/state-telemetry/src/lib/projector/progress-weighting.spec.ts`
- **Gate**: type
- acceptance:
  - "El peso por defecto de una slice es `1 + log2(acceptance_count)`; un override en `proposal.md#slices[i].weight` se respeta si y sólo si está en `[0.1, 100]`."
  - "El progreso de la proposal agregada es `Σ(progress(slice) × weight(slice)) / Σ(weight(slice))`, recalculado de forma estable (orden canónico de `slice_id`)."
  - "Test: una proposal con 3 slices de pesos 1, 4, 8 y progresos 100/100/100 reporta `100.0`; 100/50/0 reporta `37.5` (= (100×1 + 50×4 + 0×8) / 13)."
  - "Slice sin `acceptance_criteria` recibe peso por defecto `1` y reporta `progress: 1.0` cuando su `status === 'done'` (degradación elegante)."

### F2-S5 — API pública `getSnapshot`, `getSnapshotsForProposal`, `subscribe` + propiedad `incremental === cleanRebuild` verde
- **Status**: pending
- **DependsOn**: [F2-S1, F2-S2, F2-S3, F2-S4]
- **Files**: `packages/state-telemetry/src/public/index.ts`, `packages/state-telemetry/tests/integration/projector-ratchet.spec.ts`, `packages/state-telemetry/tests/integration/incremental-equiv-rebuild.spec.ts`
- **Gate**: type
- acceptance:
  - "`@delendai/state-telemetry/public` exporta `IWorkProgressSnapshot`, `WorkPhase`, `getSnapshot(workItemId)`, `getSnapshotsForProposal(proposalId)`, `subscribe(callback)`."
  - "El subscribe es un `EventEmitter` con back-pressure: si el consumidor se retrasa, los eventos se coalescen por `workItemId` (no se entrega más de 1 evento/slice/segundo)."
  - "Test de propiedad: para 50 secuencias aleatorias de 100 eventos, `incremental(s0..sN) === cleanRebuild(s0..sN)` (probado contra el driver en memoria y contra la sombra SQLite de q00019)."
  - "Test `projector-ratchet.spec.ts` verifica que un cambio en `phase-rules.ts` que rompe el invariante de monotonicidad falla el test (ratchet descendente)."

## acceptance

- `IWorkProgressProducer implements IStateProducer` declarado con `id: 'work-progress'` y `inputs: [IProducerInputSpec<'work_events'>, IProducerInputSpec<'work_items'>, IProducerInputSpec<'work_assignments'>]`.
- `rebuild(scope)` produce el snapshot canónico en orden estable (mismo orden con mismos eventos); `reconcile(scope, delta)` actualiza sólo las filas afectadas.
- Property test `incremental === cleanRebuild` verde sobre 1000 secuencias aleatorias de eventos sintéticos (heredado del State Engine, sin reescribir).
- La fila `progress_snapshots.stalled = 1` se materializa cuando se detecta el patrón `^k con misma failure_hash ∧ k ≥ 3` (umbral configurable, default 3).
- `tools/scripts/lint/state-telemetry-purity.script.ts` cubre `packages/state-telemetry/src/lib/projector/**` y rechaza cualquier `await` dentro de `rebuild`/`reconcile`.
- `phase-rules.ts` exporta un array de `PhaseRule` (declarativo, no lógica embebida) que cualquier propuesta posterior puede extender sin tocar el projector.
- El default de la tabla mapea los 9 casos no-terminales descritos en `q00020` (read/search → investigating; write de código → implementing; test_started → testing; test_finished{exit≠0} seguido de write → fixing; validate_started sin write → validating; diff_self → reviewing; git_push → reconciling; claim sin eventos → investigating).
- Test con dataset sintético `tests/fixtures/phase-inference-fixtures.spec.ts` con ≥30 secuencias etiquetadas a mano; acierto ≥95% (los 5%，允许 son los `ambiguous` que el modelo marca como `confidence: 0.5`).
- El cambio de fase es **monótono hacia adelante** dentro de la ventana de observación (no se rebobina a `investigating` si el último evento fue `implementing`).
- `confidence` ∈ [0, 1] calculado como `1 − varianza_normalizada(últimos 10 eventos)` con cap por completitud de acceptance: si 0/5 criterios marcados → cap=0.5; si 5/5 → cap=1.
- `uncertainty = 1 − confidence` por invariante explícita (`tests/property/uncertainty-invariance.spec.ts` lo verifica).
- El test `confidence-fixtures.spec.ts` cubre 12 escenarios: 0 eventos (confidence=0, uncertainty=1), 10 eventos coherentes (confidence≈0.95), 10 eventos con 7 cambios de fase (confidence≈0.6), etc.
- La confidence se incluye SIEMPRE en el snapshot (no es opcional), para que `f00512` la pueda mostrar al lado del porcentaje.
- El peso por defecto de una slice es `1 + log2(acceptance_count)`; un override en `proposal.md#slices[i].weight` se respeta si y sólo si está en `[0.1, 100]`.
- El progreso de la proposal agregada es `Σ(progress(slice) × weight(slice)) / Σ(weight(slice))`, recalculado de forma estable (orden canónico de `slice_id`).
- Test: una proposal con 3 slices de pesos 1, 4, 8 y progresos 100/100/100 reporta `100.0`; 100/50/0 reporta `37.5` (= (100×1 + 50×4 + 0×8) / 13).
- Slice sin `acceptance_criteria` recibe peso por defecto `1` y reporta `progress: 1.0` cuando su `status === 'done'` (degradación elegante).
- `@delendai/state-telemetry/public` exporta `IWorkProgressSnapshot`, `WorkPhase`, `getSnapshot(workItemId)`, `getSnapshotsForProposal(proposalId)`, `subscribe(callback)`.
- El subscribe es un `EventEmitter` con back-pressure: si el consumidor se retrasa, los eventos se coalescen por `workItemId` (no se entrega más de 1 evento/slice/segundo).
- Test de propiedad: para 50 secuencias aleatorias de 100 eventos, `incremental(s0..sN) === cleanRebuild(s0..sN)` (probado contra el driver en memoria y contra la sombra SQLite de q00019).
- Test `projector-ratchet.spec.ts` verifica que un cambio en `phase-rules.ts` que rompe el invariante de monotonicidad falla el test (ratchet descendente).
