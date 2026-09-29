---
id: x00519
title: "State SQLite fail-closed versioning and corrupt snapshot recovery"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 28ca3ef8-cd82-4704-84bf-1711d1677d9f
last-correlation-id: 28ca3ef8-cd82-4704-84bf-1711d1677d9f
last-transition-from: review
shipped-in:
  - "605cd5f2ffc8ea8af8d44d16904bd7033c99aee4"
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
- **Status**: done
- **Files**: `packages/state-sqlite/src`
- **Gate**: type
- acceptance:
  - "Una DB futura se rechaza antes de escribir user_version."
  - "JSON inválido se transforma en state_store_corrupt."
  - "Tests cubren versión futura y snapshot corrupto."
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Constructor reads user_version BEFORE bootstrap and throws stateStoreSchemaUnsupported for any future schema version. JSON.parse errors in restorePersistedScopes are caught and stored as restoreFailure (state_store_corrupt); preflightStore surfaces them with reason:'state_store_corrupt'. Spec covers both: future schema rejection + corrupt snapshot mapping. bun test: 10/10 pass.
- review-attribution: unrecorded — nothing in Git names who delivered 605cd5f2ffc8ea8af8d44d16904bd7033c99aee4: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

## acceptance

- Una DB futura se rechaza antes de escribir user_version.
- JSON inválido se transforma en state_store_corrupt.
- Tests cubren versión futura y snapshot corrupto.
