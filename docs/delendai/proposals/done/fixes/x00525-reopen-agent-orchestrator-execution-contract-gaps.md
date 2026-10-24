---
id: x00525
title: "Reopen agent orchestrator execution contract gaps"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: b21b7a11-4b1e-4b88-bc73-514defd95ff0
last-correlation-id: b21b7a11-4b1e-4b88-bc73-514defd95ff0
last-transition-from: in-progress
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
- **Status**: done
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`, `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`, `plugins/agent-orchestrator/tests/src/lib/dispatch/linear-dispatcher.spec.ts`
- **Gate**: type
- acceptance:
  - "El dispatcher recibe y aplica el override efectivo al plan que ejecuta."
  - "Una salida limpia no dispara tres ejecuciones; solo rota ante una señal de loop/error permitida."
  - "Un throw del port se somete a la allowlist antes de reintentar."
  - "El consumo del orchestrator se registra mediante una entrada real y verificable, no un tick fijo de cero."
  - "Cada contrato tiene una prueba focalizada."
- review-state: done
- review-implementer: Carthage
- review-reviewer: Babylon
- review-log: approved by Babylon — Revisión independiente aprobada: 283810368 está publicado; 7 pruebas focalizadas, typecheck del plugin y Biome pasan. El dispatcher aplica override, salida limpia inmediata, allowlist de throws y accounting no nulo.
## acceptance

- El dispatcher recibe y aplica el override efectivo al plan que ejecuta.
- Una salida limpia no dispara tres ejecuciones; solo rota ante una señal de loop/error permitida.
- Un throw del port se somete a la allowlist antes de reintentar.
- El consumo del orchestrator se registra mediante una entrada real y verificable, no un tick fijo de cero.
- Cada contrato tiene una prueba focalizada.
