---
id: x00519
title: "State SQLite fail-closed versioning and corrupt snapshot recovery"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 22d5c0fc-7d29-468a-b96c-c64b2b4cb42e
last-correlation-id: 22d5c0fc-7d29-468a-b96c-c64b2b4cb42e
last-transition-from: in-progress
---

# x00519 — State SQLite fail-closed versioning and corrupt snapshot recovery

## Goal

Corregir la apertura de state-sqlite para leer y rechazar user_version futuras antes de bootstrap/migración, y convertir JSON lógico corrupto en state_store_corrupt.

## why

La implementación puede sobrescribir una user_version futura antes de preflightStore y puede propagar JSON.parse durante restorePersistedScopes.

## non-goals

- No cambiar el contrato puro de packages/state.
- No rediseñar proposals-sqlite.
- No cambiar snapshots válidos.

## Slices

- global_gate: type

### S1 — Fail-closed state-sqlite open and recovery tests
- **Status**: review
- **Files**: `packages/state-sqlite/src`
- **Gate**: type
- acceptance:
  - "Una DB futura se rechaza antes de escribir user_version."
  - "JSON inválido se transforma en state_store_corrupt."
  - "Tests cubren versión futura y snapshot corrupto."
## acceptance

- Una DB futura se rechaza antes de escribir user_version.
- JSON inválido se transforma en state_store_corrupt.
- Tests cubren versión futura y snapshot corrupto.
