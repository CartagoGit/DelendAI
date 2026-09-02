---
id: x00420
title: "Corregir regresión de heartbeat en withFileMutex bajo carga"
kind: fix
status: ready
type: proposal
track: concurrency
date: 2026-09-02
---

# x00420 — Corregir regresión de heartbeat en withFileMutex bajo carga

## Goal

TODO: describe the goal.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: none

### S1 — Corregir heartbeat y validar concurrencia
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`
- **Gate**: type

## acceptance

- TODO: observable acceptance criteria.
