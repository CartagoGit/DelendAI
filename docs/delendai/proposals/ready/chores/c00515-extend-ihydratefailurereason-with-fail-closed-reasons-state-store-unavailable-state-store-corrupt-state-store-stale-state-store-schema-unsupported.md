---
id: c00515
title: "Extend `IHydrateFailureReason` with fail-closed reasons (`state_store_unavailable`, `state_store_corrupt`, `state_store_stale`, `state_store_schema_unsupported`)"
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
    - c00523 # ArtifactStore + DerivationEngine interfaces for SQLite Phase 1
---

# c00515 — Extend `IHydrateFailureReason` with fail-closed reasons

## Goal

The current `IHydrateFailureReason` union in
`packages/state/src/lib/generation.ts:152` (NOT `registry.ts` as the
earlier draft claimed — this proposal corrects that; see the
post-commit review of 2026-09-06) has 6 values:

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

This proposal extends the union with **four** new reasons (the
review caught that the original three are too coarse for SQLite's
schema-version branch):

- **`state_store_unavailable`** — the durable layer is unreachable
  (DB file missing, locked by another process, IO error opening it).
  Maps to SQLite `SQLITE_BUSY`, `SQLITE_FULL`, `SQLITE_IOERR`,
  `ENOENT`, `EACCES`. Returned by the open path.
- **`state_store_corrupt`** — the durable layer is open but its
  contents are invalid (`PRAGMA integrity_check` failed, magic
  bytes wrong, fingerprint mismatch on a stored generation that
  cannot be reconciled). Returned by the integrity-check path.
- **`state_store_schema_unsupported`** — the durable layer is open
  and its `PRAGMA user_version` (or equivalent) is higher than this
  driver supports. The caller MUST NOT silently downgrade; the
  driver returns this reason so the caller can either upgrade the
  driver or run an offline migration tool. Distinct from
  `state_store_corrupt` because the contents are healthy — only
  the schema-version field disagrees.
- **`state_store_stale`** — the durable layer is open, valid, and
  schema-compatible, but its `reconciled_commit_sha` is not
  ancestor-equivalent to the current HEAD. The runner-up driver
  must answer with a richer **drift direction** instead of a flat
  boolean so the caller can pick the right reconciliation strategy
  (see `IDriftDirection` below).

Each reason is paired with a typed `IStateStoreFailure` shape that
carries the original SQLite error code / PRAGMA output / commit
hash / schema-version, so callers can route on the reason and
surface the underlying diagnostic without parsing error strings.

## Drift direction (state_store_stale companion)

`state_store_stale` is not enough on its own: the SQLite driver
needs to know whether it can answer incrementally or whether it
must do a full rebuild. The reviewer's recommendation:

```ts
export type TDriftDirection =
  | 'equal'      // reconciled_sha === head_sha; use the store as-is
  | 'behind'     // reconciled_sha is ancestor of head_sha; incremental reconcile
  | 'ahead'      // reconciled_sha is descendant of head_sha (force-pushed branch)
  | 'diverged'   // neither is ancestor of the other; full rebuild
  | 'unknown';   // commit-graph cannot resolve (missing objects, shallow fetch)
```

The driver emits the reason AND the direction together so the
caller can pick the right reconciliation path without an extra
round trip:

```ts
{
  ok: false,
  reason: 'state_store_stale',
  storeFailure: {
    reason: 'state_store_stale',
    store: 'project',
    driftDirection: 'diverged',
    observedSha: 'a82f...',
    expectedSha: 'f3c2...',
  },
}
```

Mapping to reconciliation strategy:

```
equal     → use
behind    → incremental reconcile (q00018 Phase 5)
ahead     → refuse; surface force-push to operator (mirrors
            branch-gc-engine's "ahead" branch status warning)
diverged  → full rebuild (q00018 Phase 2)
unknown   → refuse; require explicit operator override
```

## why

Without an explicit fail-closed contract, the SQLite driver has
license to fall back to in-memory or filesystem reads — which is
exactly the behaviour the user said MUST NOT happen. The acceptance
gate for the SQLite driver (q00019 acceptance: "`SqliteStateRegistry`
cumple el contrato `IStateRegistry` de Phase 0.2 + Phase 0.3") does
not currently include fail-closed; it needs to be added.

The schema-vs-corrupt split is the reviewer's catch: in earlier
drafts both collapsed to `state_store_corrupt`, which would force a
caller to either rebuild the DB (data loss) or refuse to boot
(operator lock-out). Splitting them lets a caller run the offline
migration tool that ships in q00019 S3.

The drift direction is the same insight as `branch_status.warnings`
today: a flat boolean loses the operational signal. The
`branchStatusWarnings` payload in `auto_work` already surfaces
`ahead` / `diverged` separately; the SQLite layer should mirror
that vocabulary.

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

In `packages/state/src/lib/generation.ts:152`, add four new members
to `IHydrateFailureReason`:

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
  | 'state_store_schema_unsupported'
  | 'state_store_stale';
```

Add the drift-direction enum (above) to the same file.

### S2 — Companion failure shape

Add to `packages/state/src/lib/generation.ts`:

```ts
export interface IStateStoreFailure {
  readonly reason:
    | 'state_store_unavailable'
    | 'state_store_corrupt'
    | 'state_store_schema_unsupported'
    | 'state_store_stale';
  readonly store: 'project' | 'swarm' | 'shared-content-cache' | 'worktree-cache';
  readonly errorCode?: string;
  readonly integrityCheck?: string;
  readonly observedSha?: string;
  readonly expectedSha?: string;
  readonly driftDirection?: TDriftDirection;
  readonly schemaVersion?: number;
  readonly supportedSchemaVersion?: number;
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
  reasons (never the 4 new ones) — pin the back-compat guarantee.
- The new reasons are recognised by the contract parser / shape
  validators.
- A mock driver that returns `state_store_corrupt` surfaces the
  `storeFailure` payload intact through the union.
- A mock driver that returns `state_store_stale` with
  `driftDirection: 'diverged'` surfaces both fields together
  (so callers do not need a second round trip).
- A mock driver that returns `state_store_schema_unsupported`
  with `schemaVersion: 7, supportedSchemaVersion: 6` is treated
  as DISTINCT from `state_store_corrupt` (a test that asserts
  the union discriminant on `reason`).

### S5 — Documentation sync

- `packages/state/README.md` — document the four new reasons, the
  `IStateStoreFailure` shape, and the drift-direction vocabulary
  with the reconciliation-strategy mapping table.
- `packages/state/src/lib/generation.ts:152` JSDoc — the existing
  reason list now includes the fail-closed four with a one-line
  description each.

### S6 — Cross-reference

Update `q00019` plan's acceptance section to reference this
proposal so the SQLite driver's fail-closed property has a
single source of truth.

## Acceptance

- `IHydrateFailureReason` includes the four new reasons.
- `IStateStoreFailure` carries `reason` + `store` + at least one
  diagnostic field.
- `TDriftDirection` carries the five directions with the
  reconciliation-strategy mapping documented.
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
- The offline migration tool that handles
  `state_store_schema_unsupported` — that lands in q00019 S3.