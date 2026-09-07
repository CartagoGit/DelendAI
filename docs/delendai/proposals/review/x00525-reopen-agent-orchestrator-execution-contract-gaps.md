---
id: x00525
title: "Reopen agent orchestrator execution contract gaps"
kind: fix
status: in-progress
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: bc96ea3f-616b-48a0-97a0-2077603e3e15
last-correlation-id: bc96ea3f-616b-48a0-97a0-2077603e3e15
last-transition-from: ready
---

# x00525 — Reopen agent orchestrator execution contract gaps

## Goal

Corregir los incumplimientos confirmados tras x00521: override efectivo en dispatch, happy path sin triple ejecución salvo señal real de loop, throws sujetos a la misma allowlist y accounting verificable del consumo del orchestrator.

## why

La review aceptó x00521 con tests verdes, pero el código aún deja contratos públicos ignorados o parcialmente aplicados.

## non-goals

- No implementar ejecución paralela.
- No cambiar el protocolo MCP salvo lo imprescindible para propagar el contrato.
- No modificar el selector de agentes ni otros plugins.

## Slices

- global_gate: type

### S1 — Corregir dispatcher y añadir regresiones contractuales
- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`, `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`, `plugins/agent-orchestrator/tests/src/lib/dispatch/linear-dispatcher.spec.ts`
- **Gate**: type
- acceptance:
  - "El dispatcher recibe y aplica el override efectivo al plan que ejecuta."
  - "Una salida limpia no dispara tres ejecuciones; solo rota ante una señal de loop/error permitida."
  - "Un throw del port se somete a la allowlist antes de reintentar."
  - "El consumo del orchestrator se registra mediante una entrada real y verificable, no un tick fijo de cero."
  - "Cada contrato tiene una prueba focalizada."

## acceptance

- El dispatcher recibe y aplica el override efectivo al plan que ejecuta.
- Una salida limpia no dispara tres ejecuciones; solo rota ante una señal de loop/error permitida.
- Un throw del port se somete a la allowlist antes de reintentar.
- El consumo del orchestrator se registra mediante una entrada real y verificable, no un tick fijo de cero.
- Cada contrato tiene una prueba focalizada.
