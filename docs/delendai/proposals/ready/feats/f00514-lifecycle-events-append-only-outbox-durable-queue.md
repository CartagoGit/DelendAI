---
id: f00514
title: "lifecycle_events append-only + outbox durable queue"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-EVENTS-OUTBOX-013
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - r00047
  - r00048
---

# f00514 — lifecycle_events append-only + outbox durable queue

## Goal

Add one append-only ledger and one durable mutable queue to the
proposals DB:

1. **`lifecycle_events`** — every transition writes a row (entity_type,
   entity_id, from_status, to_status, actor, source, event_revision,
   occurred_at). This is the audit trail; once written, rows are never
   updated or deleted.
2. **`outbox`** — every side effect (regenerate legacy JSON index,
   notify an agent, commit a file) writes a row (idempotency_key, kind,
   payload, status, attempts, last_error, next_attempt_at). The
   outbox processor consumes these rows outside any user transaction.

`lifecycle_events` is append-only. `outbox` is a durable delivery queue
whose rows are inserted by the write path and then updated by the
processor as delivery progresses. Together they answer "why is this
proposal closed?" and "why didn't the file get regenerated?".

## Why

> Eventos append-only. Añadiría `lifecycle_events`. Ejemplo:
> `proposal.created`, `proposal.activated`, `plan.created`,
> `slice.completed`, `proposal.completed`, `proposal.closed`. Cada
> evento: entity_id, entity_revision, event_type, timestamp, actor,
> source, metadata. Esto permite responder después "¿Por qué esta
> propuesta está cerrada?" sin reconstruirlo mirando commits y restos
> de archivos.

> Patrón Outbox para las operaciones externas. Cerrar una proposal
> puede implicar posteriormente: modificar Git, escribir markdown,
> notificar agente, actualizar otra representación. No mezclaría esos
> efectos con la transacción SQLite. Haría:
> `BEGIN; UPDATE proposal; INSERT lifecycle_event; INSERT outbox; COMMIT`
> Y posteriormente: `outbox processor → Git/file action`. Con
> idempotency key. Así un crash después del commit no pierde el efecto
> pendiente.

These two patterns are the storage-layer foundation that lets
delendai answer "why" and "did the side-effect fire" without resorting
to filesystem archaeology.

## Why this design

**Append-only at the SQL level for lifecycle only.**
`lifecycle_events` gets explicit no-update/no-delete guards in SQL.
`outbox` does not: it has a state machine and is intentionally mutable
by the processor.

**Same transaction as the entity write.** A close proposal writes
`UPDATE proposals SET status='done'` + `INSERT INTO lifecycle_events
(...)` + `INSERT INTO outbox (...)` in the same IMMEDIATE transaction.
If any of the three fails, all three roll back.

**Outbox processor is async, idempotent, retries.** `OutboxProcessor`
runs every N seconds (configurable), selects rows with
`status = 'pending' AND next_attempt_at <= now()` plus abandoned
`in-flight` rows whose lease has expired, attempts the side effect,
and on success marks the row `status = 'done'`; on failure bumps
`attempts` and either schedules a retry or marks `status = 'failed'`
after a cap.

**Leases, not sticky in-flight rows.** The outbox must record who
claimed a delivery attempt and until when. A crash after
`markInFlight()` cannot strand the row forever; a later processor run
must be able to reclaim expired leases deterministically.

**Idempotency keys are first-class.** Every outbox row carries an
`idempotency_key` (`sha256(kind + payload + entity_id + source_commit)`).
The processor gives at-least-once delivery with idempotent handlers;
duplicate side-effects are tolerated by the handler contract, not by a
false exactly-once guarantee.

## non-goals

- Do NOT introduce event sourcing end-to-end. The events are
  audit-only; the entity rows remain the source of truth. The audit
  recommended this explicitly: "Event sourcing completo: No;
  lifecycle log parcial es suficiente."
- Do NOT touch the storage layer for `@delendai/state` (q00019 owns
  its own DB).
- Do NOT introduce a messaging queue. The outbox processor is a
  single in-process loop; cross-process delivery is out of scope.
- Do NOT promise exactly-once side-effect delivery. The guarantee is
  at-least-once delivery plus idempotent handlers.

## Slices

- global_gate: lint

### S1 — `lifecycle_events` repository + immutability hardening + write hooks

- **Status**: done
- **Shipped-In**: 6e7780392 feat(sqlite): add lifecycle and outbox repository foundation
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts`
    (modified — schema version bump for the forward hardening migration)
  - `packages/proposals-sqlite/src/lib/migrations/0003_lifecycle_events.sql`
    (existing baseline — reuse the current table; only add a forward
    hardening migration if append-only SQL guards are still missing)
  - `packages/proposals-sqlite/src/lib/migrations/0007_lifecycle_events_append_only_guards.sql`
    (new — forward hardening migration for append-only SQL guards)
  - `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
    (modified — migration/version expectations)
  - `packages/proposals-sqlite/src/lib/repository/lifecycle-repo.ts`
    (new — append-only repository)
  - `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts`
    (modified — every write method now writes a lifecycle row in the
    same transaction)
  - `packages/proposals-sqlite/src/lib/repository/plans-repo.ts`
    (modified)
  - `packages/proposals-sqlite/src/lib/repository/slices-repo.ts`
    (modified)
  - `packages/proposals-sqlite/tests/src/lib/repository/lifecycle-repo.spec.ts`
    (new)
  - `packages/proposals-sqlite/tests/src/lib/repository/lifecycle-hooks.spec.ts`
    (new — verifies every entity write is paired with an event)
- **Gate**: type
- acceptance:
  - The existing `lifecycle_events` table from
    `0003_lifecycle_events.sql` remains the baseline schema; any missing
    append-only SQL guard is added via a forward hardening migration,
    not by pretending the table does not exist yet.
  - SQL triggers reject UPDATE and DELETE on `lifecycle_events`.
  - No UPDATE or DELETE method exists on `lifecycle-repo`.
  - A closed proposal writes `event_revision = proposal.revision`
    atomically.
  - A rollback removes the event row too.
  - `bun run typecheck` green.

### S2 — `outbox` repository + processor-state transitions + same-transaction write

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts`
    (modified — schema version bump for the forward lease-recovery migration)
  - `packages/proposals-sqlite/src/lib/migrations.ts`
    (modified — include the new forward hardening migration)
  - `packages/proposals-sqlite/src/lib/migrations/0004_outbox.sql`
    (existing baseline — reuse the current table; only add a forward
    hardening migration if the processor-state contract needs more
    structure)
  - `packages/proposals-sqlite/src/lib/migrations/0009_outbox_leases.sql`
    (new — forward migration for lease owner / expiry recovery)
  - `packages/proposals-sqlite/src/lib/repository/outbox-repo.ts`
    (new — enqueue + processor-state repository)
  - `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts`
    (modified — every write that has a side-effect also inserts into
    `outbox`)
  - `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
    (modified — migration/version expectations)
  - `packages/proposals-sqlite/tests/src/lib/repository/outbox-repo.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - The existing `outbox` table from `0004_outbox.sql` remains the
    baseline schema; any additional hardening lands as a forward
    migration, not as a duplicate "add outbox" step.
  - `outbox.status` is a constrained enum with at least `pending | in-flight | done | failed`.
  - The schema/repository reserve lease metadata for in-flight work so
    abandoned rows can be reclaimed safely by a later processor tick.
  - `enqueue({ kind, payload, idempotencyKey })` returns
    `{ kind: 'enqueued' | 'already_enqueued' }` (dedupes on the key).
  - Every `closeProposal` / `updateProposal` call that triggers a
    legacy-index regeneration enqueues an `outbox` row with the
    right `idempotency_key`.
- review-state: in_review
- review-implementer: github-copilot
### S3 — `OutboxProcessor`: in-process loop, retry with exponential backoff, idempotent

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/outbox/processor.ts` (new —
    `OutboxProcessor` class)
  - `packages/proposals-sqlite/src/lib/outbox/handlers/regenerate-index.ts`
    (new — calls `index-regenerator` for the legacy JSON export)
  - `packages/proposals-sqlite/src/lib/outbox/handlers/notify-agent.ts`
    (new — placeholder for future agent notifications)
  - `packages/proposals-sqlite/tests/src/lib/outbox/processor.spec.ts`
    (new)
  - `packages/proposals-sqlite/tests/e2e/outbox-retry.spec.ts` (new)
- **Gate**: e2e
- acceptance:
  - `OutboxProcessor.tick()` selects pending rows whose
    `next_attempt_at <= now` plus expired leased rows, attempts the
    handler, and updates the row. Handlers run synchronously inside
    the tick (no awaitable yields inside the SQL transaction).
  - Claiming work writes a lease owner + lease expiry, and a later tick
    can reclaim the row when that lease expires.
  - Successful handlers set `status = 'done'`.
  - Failed handlers bump `attempts`, schedule a retry with
    exponential backoff (1s → 2s → 4s → 8s, cap 60s), and record
    `last_error`.
  - After 10 attempts the row is set to `status = 'failed'`.
  - The processor is idempotent under restart: it may retry the same
    row after a crash, but handlers remain safe because they dedupe on
    `idempotency_key`.
  - The e2e test simulates a crash mid-tick and verifies the
    side-effect still completes after restart.

## acceptance

- All S1-S3 slices land.
- `SELECT * FROM lifecycle_events WHERE entity_uid = '<uid>';` answers
  "why is this proposal closed?".
- `SELECT * FROM outbox WHERE status = 'failed';` answers
  "which side-effects didn't fire?".
- The audit invariants #13 ("todo cambio lifecycle deja evento") and
  #12 ("los efectos externos tienen outbox") are demonstrably satisfied.

## notes

- The outbox processor is intentionally minimal: in-process, single
  loop, no cross-process delivery. If the project later needs cross-
  process or cross-host outbox, that is a separate proposal.
- `lifecycle_events` is append-only at the schema level; `outbox` is a
  mutable delivery queue by design.
- `q00022 S1` already created the baseline tables. The remaining work in
  `f00514` is repository semantics, append-only enforcement, same-
  transaction hooks, and processor behavior.