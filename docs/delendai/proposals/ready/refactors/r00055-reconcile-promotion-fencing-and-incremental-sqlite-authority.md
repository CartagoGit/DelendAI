---
id: r00055
title: "Reconcile promotion fencing and incremental SQLite authority"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# r00055 — Reconcile promotion fencing and incremental SQLite authority

## Goal

Hacer que reconcile sea seguro frente a snapshots obsoletos, desapariciones clasificadas y ejecución incremental real sobre SQLite.

## why

TODO: why this work matters now.

## non-goals

- No cambiar aún todos los read paths del plugin; eso pertenece a r00049.
- No eliminar INDEX.json ni Markdown.
- No migrar todavía el swarm state completo al State Engine.

## Slices

- global_gate: none

### S1 — Fencing, desapariciones clasificadas e incremental reconcile
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`, `packages/proposals-sqlite/src/lib/reconciler-staging.ts`, `packages/proposals-sqlite/src/lib/reconciler.ts`, `packages/proposals-sqlite/src/lib/repository/tombstones-repo.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts`, `packages/proposals-sqlite/tests/e2e/incremental-reconcile.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Una staging creada desde generation/source commit G sólo se promociona si active sigue en G."
  - "Una active avanzada rechaza la promoción con stale-generation sin modificar filas."
  - "Una entidad ausente en staging recibe una clasificación explícita tombstone/quarantine/retire y no queda viva silenciosamente."
  - "mode incremental aplica cambios a active SQLite, es idempotente y no duplica lifecycle/outbox."
  - "integrity_check y foreign_key_check siguen en ok."

## acceptance

- Una staging creada desde generation/source commit G sólo se promociona si active sigue en G.
- Una active avanzada rechaza la promoción con stale-generation sin modificar filas.
- Una entidad ausente en staging recibe una clasificación explícita tombstone/quarantine/retire y no queda viva silenciosamente.
- mode incremental aplica cambios a active SQLite, es idempotente y no duplica lifecycle/outbox.
- integrity_check y foreign_key_check siguen en ok.
