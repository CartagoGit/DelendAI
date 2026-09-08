---
id: r00056
title: "SQLite storage modes and canonical proposals DB wiring"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# r00056 — SQLite storage modes and canonical proposals DB wiring

## Goal

Centralizar la ruta de proposals.sqlite y hacer explícita la política de fallback/error durante el cutover.

## why

TODO: why this work matters now.

## non-goals

- No implementar aquí el cambio completo de autoridad de r00049.
- No migrar el State Engine general.
- No borrar legacy files.

## Slices

- global_gate: none

### S1 — Resolver única de rutas, storage modes y doctor
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/paths.ts`, `plugins/proposals/src/lib/storage-mode.ts`, `plugins/proposals/src/lib/services/sql-lifecycle-readers.ts`, `plugins/proposals/src/lib/services/reconciler-service.ts`, `plugins/proposals/src/lib/services/db-doctor/checks/storage-mode.ts`, `packages/proposals-sqlite/tests/src/lib/paths.spec.ts`, `plugins/proposals/tests/src/lib/storage-mode.spec.ts`, `plugins/proposals/tests/src/lib/services/db-doctor.spec.ts`
- **Gate**: type
- acceptance:
  - "Plugin, reconciler, CLI, doctor, exporter y tests usan la misma resolución de DB activa/staging."
  - "No quedan joins ad hoc a proposals.sqlite en los paths operacionales."
  - "shadow permite fallback documentado; sql-primary-compare sirve desde SQLite; sql-only convierte DB missing/corrupt en error explícito y nunca cae silenciosamente a JSON/Markdown."
  - "doctor informa mode, canonical path, fallback count y parity status."

## acceptance

- Plugin, reconciler, CLI, doctor, exporter y tests usan la misma resolución de DB activa/staging.
- No quedan joins ad hoc a proposals.sqlite en los paths operacionales.
- shadow permite fallback documentado; sql-primary-compare sirve desde SQLite; sql-only convierte DB missing/corrupt en error explícito y nunca cae silenciosamente a JSON/Markdown.
- doctor informa mode, canonical path, fallback count y parity status.
