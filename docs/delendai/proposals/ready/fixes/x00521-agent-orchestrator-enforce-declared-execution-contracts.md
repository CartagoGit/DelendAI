---
id: x00521
title: "Agent orchestrator enforce declared execution contracts"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-07
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
- **Status**: pending
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

## acceptance

- override llega a classify/plan.
- timeoutMs se aplica realmente.
- Dependencias transitivas fallidas se omiten.
- Budgets son acumulativos y el orchestrator registra consumo real.
- Throws del port respetan la misma policy.
- El happy path no se triplica sin señal de loop.
- Tests focalizados cubren cada contrato.
