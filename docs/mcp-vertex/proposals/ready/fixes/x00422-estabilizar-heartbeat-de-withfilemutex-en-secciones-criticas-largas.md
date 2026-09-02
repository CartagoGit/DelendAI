---
id: x00422
title: "Estabilizar heartbeat de withFileMutex en secciones críticas largas"
kind: fix
status: ready
type: proposal
track: concurrency
date: 2026-09-02
---

# x00422 — Estabilizar heartbeat de withFileMutex en secciones críticas largas

## Goal

TODO: describe the goal.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: none

### S1 — Corregir heartbeat y prueba de concurrencia
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`
- **Gate**: type

## acceptance

- TODO: observable acceptance criteria.
