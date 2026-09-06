---
id: c00515
title: "Extend `IHydrateFailureReason` with fail-closed reasons (`state_store_unavailable`, `state_store_corrupt`, `state_store_stale`)"
kind: chore
status: ready
type: proposal
track: state-engine
date: 2026-09-06
priority: P0
related:
    - c00510 # the parent hardening round
    - c00514 # purity lint — must land before the SQLite driver can rely on it
    - q00019 # state-engine phase 1 SQLite — the contract this enables
---

# c00515 — Extend `IHydrateFailureReason` with fail-closed reasons

## Goal

The current `IHydrateFailureReason` union in
`packages/state/src/lib/registry.ts:144-160` has 6 values:

```
producer_threw | fingerprint_mismatch | scope_not_supported |
snapshot_unavailable | projection_invalid | snapshot_invalid
```

None of them describe a **durable layer failure**: a missing DB, a
corrupt WAL, a stale generation, a schema mismatch. The audit
(2026-09-06, "L §1.1 + §1.2") flagged this as the blocker for the
SQLite fail-closed invariant the user asked for: today there is no
documented obligation for the driver to return a specific reason when
the DB is unhealthy, and no test pinning it.

This proposal extends the union with three new reasons:

- **`state_store_unavailable`** — the durable layer is unreachable
  (DB file missing, locked by another process, IO error opening it).
  Maps to SQLite `SQLITE_BUSY`, `SQLITE_FULL`, `SQLITE_IOERR`, etc.
- **`state_store_corrupt`** — the durable layer is open but its
  contents are invalid (`PRAGMA integrity_check` failed, magic
  bytes wrong, schema_version mismatch, fingerprint mismatch on a
  stored generation).
- **`state_store_stale`** — the durable layer is open and valid, but
  its `reconciled_commit_sha` is not an ancestor of the current
  HEAD, so the runtime needs a reconcile pass before it can answer
  queries.

Each reason is paired with a typed `IStateStoreFailure` shape that
carries the original SQLite error code / PRAGMA output / commit
hash, so callers can route on the reason and surface the underlying
diagnostic without parsing error strings.

## why

Without an explicit fail-closed contract, the SQLite driver has
license to fall back to in-memory or filesystem reads — which is
exactly the behaviour the user said MUST NOT happen. The acceptance
gate for the SQLite driver (q00019 acceptance: "`SqliteStateRegistry`
cumple el contrato `IStateRegistry` de Phase 0.2 + Phase 0.3") does
not currently include fail-closed; it needs to be added.

## why this design

Adding the reasons to the existing discriminated union is the
minimum surface area. No new method, no new option, no new producer.
The SQLite driver (q00019 S1) implements the contract; the
in-memory driver never returns these reasons (it has no durable
layer), which keeps the back-compat guarantee.

The companion `IStateStoreFailure` shape is intentionally narrow: a
reason + the raw error code + the layer name. Callers that need more
diagnostic depth can read `state-failure.log` (a new sink path)
rather than crowding the union.

## Tasks

### S1 — Union extension

In `packages/state/src/lib/registry.ts:144-160`, add three new
members to `IHydrateFailureReason`:

```ts
export type IHydrateFailureReason =
  | 'producer_threw'
  | 'fingerprint_mismatch'
  | 'scope_not_supported'
  | 'snapshot_unavailable'
  | 'projection_invalid'
  | 'snapshot_invalid'
  | 'state_store_unavailable'
  | 'state_store_corrupt'
  | 'state_store_stale';
```

### S2 — Companion failure shape

Add to `packages/state/src/lib/registry.ts`:

```ts
export interface IStateStoreFailure {
  readonly reason:
    | 'state_store_unavailable'
    | 'state_store_corrupt'
    | 'state_store_stale';
  readonly store: 'project' | 'swarm' | 'shared-content-cache' | 'worktree-cache';
  readonly errorCode?: string;
  readonly integrityCheck?: string;
  readonly observedSha?: string;
  readonly expectedSha?: string;
}
```

Extend `IHydrateResult` to carry `storeFailure?: IStateStoreFailure`
when `ok === false`.

### S3 — In-memory driver conformance

`InMemoryStateRegistry` (`packages/state/src/lib/driver-in-memory.ts`)
NEVER returns the new reasons (it has no durable layer). Add a test
that asserts this property explicitly so a future refactor cannot
accidentally regress.

### S4 — Contract tests

Add `packages/state/tests/src/fail-closed-contract.spec.ts`:

- An `InMemoryStateRegistry` always returns one of the 6 historical
  reasons (never the 3 new ones) — pin the back-compat guarantee.
- The new reasons are recognised by the contract parser / shape
  validators.
- A mock driver that returns `state_store_corrupt` surfaces the
  `storeFailure` payload intact through the union.

### S5 — Documentation sync

- `packages/state/README.md` — document the three new reasons and
  the `IStateStoreFailure` companion shape.
- `packages/state/src/lib/registry.ts:144-160` JSDoc — the existing
  reason list now includes the fail-closed trio with a one-line
  description each.

## Acceptance

- `IHydrateFailureReason` includes the three new reasons.
- `IStateStoreFailure` carries `reason` + `store` + at least one
  diagnostic field.
- `InMemoryStateRegistry` never returns the new reasons (test pins
  the back-compat guarantee).
- The new spec exits 0.
- `bun run validate` stays green.

## Out of scope

- Implementing the SQLite driver that consumes these reasons —
  that is q00019.
- The purity lint (c00514) — also a precondition, but a separate
  slice.
- Replaying a stale store's contents to recover — that is the
  responsibility of a higher-level `state_reconcile_apply` engine
  (Phase 5 of q00018).