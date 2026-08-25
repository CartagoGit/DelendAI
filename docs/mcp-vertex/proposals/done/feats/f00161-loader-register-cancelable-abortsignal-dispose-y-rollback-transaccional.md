---
id: f00161
title: "loader: register cancelable (AbortSignal), dispose() y rollback transaccional"
kind: feat
status: done
type: proposal
track: lifecycle
date: 2026-08-24
shipped-in:
  - 37a63672 # chore(proposals): mover 17 propuestas completadas a review
  - 7fa50e79 # feat(loader): f00161 — register cancelable (AbortSignal), dispose y rollback transaccional
---

# f00161 — loader: register cancelable (AbortSignal), dispose() y rollback transaccional

## Goal

Dar al lifecycle de plugins **cancelación real**, **dispose** y **rollback transaccional**.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §3 PL-005 — timeout cancelable (hoy `Promise.race` no cancela el trabajo)
- §3 PL-006 — `dispose()` de plugins
- §3 PL-007 — rollback transaccional de registro

Contrato objetivo:

```ts
register(ctx, signal?: AbortSignal): Promise<IPluginRuntime>
interface IPluginRuntime {
  registrations: ...;
  dispose?: () => Promise<void>;
}
```

Un plugin que supera el timeout debe poder ser abortado (o marcado como no cancelable con teardown diferido). Si un plugin registra timer + tool + listener y falla en el paso 4, debe deshacer 1–3.

## why

`Promise.race` limita la espera pero no detiene la promesa: un plugin puede seguir abriendo sockets, escribiendo archivos o instalando listeners tras ser marcado como fallido. Sin dispose/rollback no hay activación dinámica ni tests aislados fiables.

## non-goals

- No obligar a todos los plugins a soportar abort en una sola pasada: se admite capability 'abortable' vs 'non-abortable'.
- No implementar hot-reload de runtime completo en esta propuesta.
- No cambiar la semántica de activación dinámica (propuesta separada).

## Slices

- global_gate: type

### S1 — Contrato IPluginRuntime y AbortSignal en register
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/plugin-contract.ts`
- **Gate**: type
- acceptance:
  - "register(ctx, signal) acepta AbortSignal."
  - "IPluginRuntime expone registrations y dispose opcional."
  - "Se define la capability abortable vs non-abortable."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Timeout cancelable y rollback transaccional
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/load-plugins.ts`
- **Gate**: type
- acceptance:
  - "El timeout aborta el trabajo subyacente (no solo Promise.race)."
  - "Un plugin non-abortable se marca como tal y se espera su teardown."
  - "Si un registro falla a mitad, se revierte lo ya registrado (timer/tool/listener)."

### S3 — Tests de cancelación, dispose y rollback
- **Status**: done
- **Files**: `packages/core/tests/src/lib/plugins/register-cancel-dispose.spec.ts`
- **Gate**: type
- acceptance:
  - "Cubre register timeout, register abort, partial registration con rollback y dispose fail."

## acceptance

- register(ctx, signal) acepta AbortSignal.
- IPluginRuntime expone registrations y dispose opcional.
- Se define la capability abortable vs non-abortable.
- El timeout aborta el trabajo subyacente (no solo Promise.race).
- Un plugin non-abortable se marca como tal y se espera su teardown.
- Si un registro falla a mitad, se revierte lo ya registrado (timer/tool/listener).
- Cubre register timeout, register abort, partial registration con rollback y dispose fail.
