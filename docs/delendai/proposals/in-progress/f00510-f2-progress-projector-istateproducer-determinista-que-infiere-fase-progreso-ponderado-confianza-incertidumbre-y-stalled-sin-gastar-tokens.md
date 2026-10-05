---
id: f00510
title: "F2 — Progress Projector: IStateProducer determinista que infiere fase, progreso ponderado, confianza, incertidumbre y stalled sin gastar tokens"
kind: feat
status: in-progress
type: proposal
track: trust
date: 2026-09-06
parent-plan: q00020
depends-on:
    - q00019
    - f00509
cascadeBoost: shipped-blocking
tags:
    - work-telemetry
    - state-engine
    - projector
    - non-llm
last-transition-id: 9ad1635a-64c5-4fff-883f-00f411a483a7
last-correlation-id: 9ad1635a-64c5-4fff-883f-00f411a483a7
last-transition-from: ready
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

### S1 — `IWorkProgressProducer` + tabla `progress_snapshots` (un IStateProducer real)
- **Status**: review
- **DependsOn**: [f00509]
- **Files**: `packages/state-telemetry/src/lib/projector/work-progress-producer.service.ts`, `packages/state-telemetry/src/lib/projector/work-progress-producer.service.spec.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.service.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.service.spec.ts`, `packages/state-telemetry/src/lib/projector/contracts/constants/work-progress.constant.ts`, `packages/state-telemetry/src/lib/projector/contracts/interfaces/work-progress.interface.ts`, `packages/state-telemetry/src/lib/projector/test-support.helper.ts`, `packages/state-telemetry/vitest.config.ts`, `tools/scripts/lint/state-telemetry-purity.script.ts`, `tools/scripts/lint/state-telemetry-purity.script.spec.ts`, `package.json`
- **Gate**: bunx vitest run --root packages/state-telemetry src/lib/projector && bunx vitest run tools/scripts/lint/state-telemetry-purity.script.spec.ts
- acceptance:
  - "`createWorkProgressProducer()` returns an `IStateProducer` with `id: 'work-progress'` and three declared opaque inputs (`work_events`, `work_items`, `work_assignments`). The tables `work_items`, `work_assignments` and `progress_snapshots` do not exist, so the projector is pure: no SQL table, no migration; the host supplies the inputs as JSON."
  - "`rebuild(scope)` produce el snapshot canónico en orden estable (mismo orden con mismos eventos); `reconcile(scope, delta)` actualiza sólo las filas afectadas."
  - "Property test `reconcile`-in-chunks equals a clean `rebuild` over 200 seeded random sequences of 60 events (200 keeps the CI run short; the PRNG is a small seeded generator, no new dependency)."
  - "The snapshot's `stalled` is true when the same failure hash (the payload hash of a `tool_error` event) repeats k >= 3 times in a row (configurable, default 3); a different hash or a code change restarts the run."
  - "`tools/scripts/lint/state-telemetry-purity.script.ts` covers `packages/state-telemetry/src/lib/projector/**`, rejects any `await` inside `rebuild`/`reconcile` and any persistent I/O import, and is chained into `lint:architecture`."
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — `phase-inference.ts` — tabla declarativa read→investigating, edit→implementing, test→testing, fix→fixing, validate→validating, review→reviewing, push→reconciling
- **Status**: review
- **DependsOn**: [F2-S1]
- **Files**: `packages/state-telemetry/src/lib/projector/phase-inference.service.ts`, `packages/state-telemetry/src/lib/projector/phase-inference.service.spec.ts`, `packages/state-telemetry/src/lib/projector/phase-rules.service.ts`, `packages/state-telemetry/src/lib/projector/contracts/constants/phase-rules.constant.ts`
- **Gate**: bunx vitest run --root packages/state-telemetry src/lib/projector
- acceptance:
  - "`DEFAULT_PHASE_RULES` is a declarative array of `IPhaseRule`; `resolvePhaseRules(extra)` prepends caller rules, so a later proposal extends the table without touching the projector."
  - "The default table maps the event kinds that exist on the bus: tool_called/tool_finished/claims -> investigating; git_change -> implementing; test_started -> testing; git_change right after test_finished or tool_error -> fixing; slice_changes_requested -> fixing; stale_acceptance -> validating; slice_submitted -> reviewing; slice_approved -> reconciling. The bus has no read/write, validate or push kinds, so those rows of the original table are not expressible. `blocked` and `done` come from the item's status."
  - "`phase-inference.service.spec.ts` holds 32 hand-labelled streams and requires at least 95% to infer the labelled phase."
  - "The phase is monotonic forward: the fold keeps the highest rank seen, so a later `tool_called` never rewinds `implementing`."
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — `confidence-model.ts` — confidence + uncertainty derivados de la varianza de los últimos N eventos y de la completitud del `work_items.acceptance_criteria`
- **Status**: review
- **DependsOn**: [F2-S1]
- **Files**: `packages/state-telemetry/src/lib/projector/confidence-model.service.ts`, `packages/state-telemetry/src/lib/projector/confidence-model.service.spec.ts`
- **Gate**: bunx vitest run --root packages/state-telemetry src/lib/projector
- acceptance:
  - "`confidence` is in [0, 1], computed as 1 minus the variance of the phase ranks of the last 10 events divided by the largest possible variance, capped by acceptance completeness: 0 of 5 checked gives cap 0.5, 5 of 5 gives cap 1 (linear between), and a slice with no criteria is uncapped. No events gives 0."
  - "`uncertainty = 1 - confidence` by definition; `confidence-model.service.spec.ts` checks it on every scenario."
  - "`confidence-model.service.spec.ts` covers 12 scenarios with exact expected values (no events gives confidence 0 and uncertainty 1; ten coherent events give 1 before the cap; alternating extremes give 0; and so on)."
  - "Confidence and uncertainty are always present in the snapshot so a view can show them beside the percentage."
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S4 — `progress-weighting.ts` — Σ(completion × weight) / Σ(weight), con pesos por defecto derivados de la posición de la slice en la proposal y override opcional en frontmatter
- **Status**: review
- **DependsOn**: [F2-S1]
- **Files**: `packages/state-telemetry/src/lib/projector/progress-weighting.service.ts`, `packages/state-telemetry/src/lib/projector/progress-weighting.service.spec.ts`
- **Gate**: bunx vitest run --root packages/state-telemetry src/lib/projector
- acceptance:
  - "The default slice weight is `1 + log2(acceptance_count)`; an explicit weight is honoured if and only if it is inside [0.1, 100]."
  - "The aggregated proposal progress is Sum(progress x weight) / Sum(weight), summed in canonical slice-id order."
  - "Test: three slices weighing 1, 4 and 8 report 100 at 100/100/100 and 300/13 (about 23.08) at 100/50/0. The original example claimed 37.5, which is not what (100x1 + 50x4 + 0x8) / 13 equals."
  - "A slice with no acceptance criteria weighs 1 and reports progress 100 (the scale is 0..100 throughout) when its status is `done`, and 0 otherwise."
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S5 — API pública `getSnapshot`, `getSnapshotsForProposal`, `subscribe` + propiedad `incremental === cleanRebuild` verde
- **Status**: review
- **DependsOn**: [F2-S1, F2-S2, F2-S3, F2-S4]
- **Files**: `packages/state-telemetry/src/lib/projector/work-progress-api.service.ts`, `packages/state-telemetry/src/lib/projector/work-progress-api.service.spec.ts`, `packages/state-telemetry/src/public/index.ts`, `packages/state-telemetry/package.json`, `packages/state-telemetry/tests/integration/projector-ratchet.spec.ts`, `packages/state-telemetry/tests/integration/incremental-equiv-rebuild.spec.ts`
- **Gate**: bunx vitest run --root packages/state-telemetry src/lib/projector && bunx vitest run --root packages/state-telemetry tests/integration
- acceptance:
  - "`@delendai/state-telemetry/public` exports `IWorkProgressSnapshot`, `IWorkPhase`, the producer factory and `createWorkProgressService()`, whose instance exposes `getSnapshot(workItemId)`, `getSnapshotsForProposal(proposalId)` and `subscribe(callback)`. The service is a factory because the state lives in the instance, not in module globals."
  - "`subscribe` applies back-pressure by coalescing per `workItemId`: at most one delivery per item per second (configurable), only the newest held snapshot is kept, and the host calls `flush()` on its own tick. The clock is injected, so specs use no real timers."
  - "Property test: for 50 seeded random sequences of 100 events appended in uneven chunks, the incremental service equals a clean rebuild. Only the in-memory path is covered: the SQLite shadow of the earlier State Engine plan does not exist."
  - "`projector-ratchet.spec.ts` checks over 50 random streams that no event lowers the phase rank, with the default rules and with a caller rule that points backwards."
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- `createWorkProgressProducer()` returns an `IStateProducer` with `id: 'work-progress'` and three declared opaque inputs (`work_events`, `work_items`, `work_assignments`). The tables `work_items`, `work_assignments` and `progress_snapshots` do not exist, so the projector is pure: no SQL table, no migration; the host supplies the inputs as JSON.
- `rebuild(scope)` produce el snapshot canónico en orden estable (mismo orden con mismos eventos); `reconcile(scope, delta)` actualiza sólo las filas afectadas.
- Property test `reconcile`-in-chunks equals a clean `rebuild` over 200 seeded random sequences of 60 events (200 keeps the CI run short; the PRNG is a small seeded generator, no new dependency).
- The snapshot's `stalled` is true when the same failure hash (the payload hash of a `tool_error` event) repeats k >= 3 times in a row (configurable, default 3); a different hash or a code change restarts the run.
- `tools/scripts/lint/state-telemetry-purity.script.ts` covers `packages/state-telemetry/src/lib/projector/**`, rejects any `await` inside `rebuild`/`reconcile` and any persistent I/O import, and is chained into `lint:architecture`.
- `DEFAULT_PHASE_RULES` is a declarative array of `IPhaseRule`; `resolvePhaseRules(extra)` prepends caller rules, so a later proposal extends the table without touching the projector.
- The default table maps the event kinds that exist on the bus: tool_called/tool_finished/claims -> investigating; git_change -> implementing; test_started -> testing; git_change right after test_finished or tool_error -> fixing; slice_changes_requested -> fixing; stale_acceptance -> validating; slice_submitted -> reviewing; slice_approved -> reconciling. The bus has no read/write, validate or push kinds, so those rows of the original table are not expressible. `blocked` and `done` come from the item's status.
- `phase-inference.service.spec.ts` holds 32 hand-labelled streams and requires at least 95% to infer the labelled phase.
- The phase is monotonic forward: the fold keeps the highest rank seen, so a later `tool_called` never rewinds `implementing`.
- `confidence` is in [0, 1], computed as 1 minus the variance of the phase ranks of the last 10 events divided by the largest possible variance, capped by acceptance completeness: 0 of 5 checked gives cap 0.5, 5 of 5 gives cap 1 (linear between), and a slice with no criteria is uncapped. No events gives 0.
- `uncertainty = 1 - confidence` by definition; `confidence-model.service.spec.ts` checks it on every scenario.
- `confidence-model.service.spec.ts` covers 12 scenarios with exact expected values (no events gives confidence 0 and uncertainty 1; ten coherent events give 1 before the cap; alternating extremes give 0; and so on).
- Confidence and uncertainty are always present in the snapshot so a view can show them beside the percentage.
- The default slice weight is `1 + log2(acceptance_count)`; an explicit weight is honoured if and only if it is inside [0.1, 100].
- The aggregated proposal progress is Sum(progress x weight) / Sum(weight), summed in canonical slice-id order.
- Test: three slices weighing 1, 4 and 8 report 100 at 100/100/100 and 300/13 (about 23.08) at 100/50/0. The original example claimed 37.5, which is not what (100x1 + 50x4 + 0x8) / 13 equals.
- A slice with no acceptance criteria weighs 1 and reports progress 100 (the scale is 0..100 throughout) when its status is `done`, and 0 otherwise.
- `@delendai/state-telemetry/public` exports `IWorkProgressSnapshot`, `IWorkPhase`, the producer factory and `createWorkProgressService()`, whose instance exposes `getSnapshot(workItemId)`, `getSnapshotsForProposal(proposalId)` and `subscribe(callback)`. The service is a factory because the state lives in the instance, not in module globals.
- `subscribe` applies back-pressure by coalescing per `workItemId`: at most one delivery per item per second (configurable), only the newest held snapshot is kept, and the host calls `flush()` on its own tick. The clock is injected, so specs use no real timers.
- Property test: for 50 seeded random sequences of 100 events appended in uneven chunks, the incremental service equals a clean rebuild. Only the in-memory path is covered: the SQLite shadow of the earlier State Engine plan does not exist.
- `projector-ratchet.spec.ts` checks over 50 random streams that no event lowers the phase rank, with the default rules and with a caller rule that points backwards.
