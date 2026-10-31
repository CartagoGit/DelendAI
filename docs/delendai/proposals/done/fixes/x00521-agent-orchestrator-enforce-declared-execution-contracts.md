---
id: x00521
title: "Agent orchestrator enforce declared execution contracts"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 5224935c-65d8-4130-8936-98030e9cf09c
last-correlation-id: 5224935c-65d8-4130-8936-98030e9cf09c
last-transition-from: in-progress
---

# x00521 — Agent orchestrator enforce declared execution contracts

## Goal

Alinear agent-orchestrator con sus contratos: override, timeout, dependencias transitivas, budgets acumulativos y retry policy.

## why

La auditoría detectó paths que aceptan opciones sin aplicarlas y enforcement parcial de límites y fallos.

## non-goals

- No implementar swarm paralelo.
- No cambiar el protocolo MCP salvo errores necesarios.

## Slices

- global_gate: e2e

### S1 — Enforce override timeout dependency budgets and retry policy
- **Status**: done
- **Files**: `plugins/agent-orchestrator/src`, `plugins/agent-orchestrator/tests`
- **Gate**: e2e
- acceptance:
  - "override llega a classify/plan."
  - "timeoutMs se aplica realmente."
  - "Dependencias transitivas fallidas se omiten."
  - "Budgets son acumulativos y el orchestrator registra consumo real."
  - "Throws del port respetan la misma policy."
  - "El happy path no se triplica sin señal de loop."
  - "Tests focalizados cubren cada contrato."
- review-state: done
- review-implementer: orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente aprobada. El orchestrator aplica timeout y saltos de dependencias con regresiones cubiertas; suite focalizada 296/296 y typecheck del plugin correctos. Commit 7fdd48ad5.
## acceptance

- override llega a classify/plan.
- timeoutMs se aplica realmente.
- Dependencias transitivas fallidas se omiten.
- Budgets son acumulativos y el orchestrator registra consumo real.
- Throws del port respetan la misma policy.
- El happy path no se triplica sin señal de loop.
- Tests focalizados cubren cada contrato.
