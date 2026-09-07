---
id: r00048
title: "CAS optimistic concurrency — revision column on proposals, plans, slices"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-CAS-007
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - r00047
---

# r00048 — CAS optimistic concurrency via revision column

## Goal

Add an integer `revision` column to every mutable row in the proposals
DB (proposals, plans, slices), enforce `revision = ?` in every UPDATE,
and return `kind: 'conflict'` (not silently overwrite) when the
revision does not match. This is the storage-layer foundation that
lets `r00047`'s idempotent lifecycle verbs be race-safe.

## Why

The audit explicitly calls out the missing CAS as a P0 invariant:

> Con varios agentes trabajando simultáneamente haría optimistic
> concurrency. Cada registro: `revision = 14`. El agente lee revision
> 14. Después: `UPDATE proposals SET ..., revision = 15 WHERE id = ? AND
> revision = 14`. Si devuelve `changes = 0`, otro agente lo modificó.
> Resultado: `CONFLICT` en lugar de sobrescribirlo silenciosamente.

Without `revision`, two agents who read the same proposal at the same
time can both decide to close it; whichever writes second wins
silently. The first agent's host has no way to know its change was
lost. This is the storage-level precondition for `r00047`'s
idempotency: idempotency is meaningful only when the storage layer
distinguishes "I changed it" from "someone else changed it first".

The State Engine already has this pattern in `StateGeneration.revision`
(Phase 0.2 closed by commit `33c1ff0cf`/`cf26d845a`/etc.). The
proposals plugin needs the same pattern, scoped to its own rows.

## Why this design

**One monotonic counter per row.** `revision INTEGER NOT NULL DEFAULT 0`
plus `revision = revision + 1` in every UPDATE. The DB enforces that
the new value is exactly the old value plus one — which means a single
UPDATE is observable as "I changed it from N to N+1", and an UPDATE that
targets a stale snapshot (revision != expected) updates zero rows.

**DB-enforced revision step guards.** `CHECK (revision >= 0)` is not
enough on its own. The schema adds triggers that ABORT any write where
`NEW.revision <> OLD.revision + 1`, so the DB itself rejects skipped,
decremented, or rewritten revisions. The repository layer still uses
the `revision = ?` filter, but the schema enforces the N -> N+1
contract directly.

**Conflict surfacing.** When `UPDATE` returns `changes === 0`, the repo
returns `kind: 'conflict'` to the caller, including the current
revision (so the host can re-read and retry with a fresh snapshot).

**No automatic merge, no retry loop in the repo.** The repo never tries
to reconcile two divergent revisions; it returns the conflict and
expects the host to decide. This keeps the storage layer simple and
the policy in the host.

## non-goals

- Do NOT change the lifecycle verbs in this proposal — `r00047` owns
  that. The repo just exposes the CAS primitive; the verbs consume it.
- Do NOT add version vectors or vector clocks. A single integer
  counter is enough for the proposals plugin (per-entity; not
  cross-entity).
- Do NOT introduce a "merge" operation. Conflicts are user-visible
  outcomes, not auto-resolved.

## Slices

- global_gate: lint

### S1 — Schema + repo primitives: `revision` on proposals, plans, slices

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts` (modified — adds
    `revision INTEGER NOT NULL DEFAULT 0` to `proposals`, `plans`,
    `slices`)
  - `packages/proposals-sqlite/src/lib/migrations.ts` (modified —
    adds `0006_add_revision.sql`)
  - `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts`
    (modified — every UPDATE filters by `revision`)
  - `packages/proposals-sqlite/src/lib/repository/plans-repo.ts`
    (modified)
  - `packages/proposals-sqlite/src/lib/repository/slices-repo.ts`
    (modified)
  - `packages/proposals-sqlite/tests/src/lib/repository/*.spec.ts`
    (new + updated)
- **Gate**: type
- acceptance:
  - All three tables have `revision INTEGER NOT NULL DEFAULT 0` with
    `CHECK (revision >= 0)` plus triggers that reject any update whose
    new revision is not exactly the old revision plus one.
  - `updateProposal(uid, { expectedRevision, patch })` returns
    `{ kind: 'updated', revision: N+1 }` on success and
    `{ kind: 'conflict', currentRevision: M }` when `M !== expectedRevision`.
  - The same shape applies to `updatePlan` and `updateSlice`.
  - Existing tests still pass; new tests cover conflict, skipped
    revision, decremented revision, and direct-SQL bypass attempts.

### S2 — Expose CAS to the host: read returns `revision`, write returns either updated or conflict

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/repository/read.ts` (new —
    `getProposal(uid) → { ..., revision }`, `listProposals(...)` includes `revision`)
  - `plugins/proposals/src/lib/services/proposal-store.ts` (modified —
    surfaces revision to the lifecycle verbs)
  - `plugins/proposals/src/lib/services/plan-store.ts` (modified)
  - `plugins/proposals/src/lib/services/slice-store.ts` (modified)
  - `plugins/proposals/tests/src/lib/services/*.spec.ts` (new + updated)
- **Gate**: type
- acceptance:
  - Every read tool (`proposals_get`, `plans_get`, `slices_get`,
    `proposals_list`, etc.) includes `revision` in its output.
  - Every write tool that previously returned `{ ok: true }` now
    returns either `{ kind: 'updated', revision }` or `{ kind:
    'conflict', currentRevision }` (or the lifecycle outcome from
    `r00047` for close verbs).
  - All public MCP tool descriptions document the new fields.

### S3 — CAS regression suite: parallel writers race; exactly one wins

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/tests/e2e/cas-race.spec.ts` (new)
  - `plugins/proposals/tests/src/lib/services/cas-regression.spec.ts`
    (new)
- **Gate**: e2e
- acceptance:
  - The e2e test launches N parallel transactions that each try to
    `updateProposal(uid, { expectedRevision: N, patch })` on the same
    row; exactly one returns `kind: 'updated'` and the rest return
    `kind: 'conflict'`. No exceptions, no corruption.
  - The same race against `closeProposal(uid)` is exercised with the
    `r00047` outcome shape — exactly one `{ kind: 'closed' }` and the
    rest `{ kind: 'already_closed' }` (which is what `r00047` will
    guarantee once `r00048` is in place).
  - The tests run deterministically 100x without flakes.

## acceptance

- All S1-S3 slices land.
- Every write to proposals, plans and slices uses the `revision` filter
  and reports either success-with-new-reversion or `conflict`.
- The audit invariant #8 ("un conflicto concurrente nunca sobrescribe
  silenciosamente") is demonstrably satisfied.

## notes

- The `revision` column is added via a forward migration, NOT a
  destructive rewrite. Existing proposals in the legacy system get
  `revision = 0`; their first write bumps them to `1`.
- The CAS primitive is intentionally minimal: integer, monotonic,
  per-entity. Anything richer (version vectors, CRDTs, etc.) is out of
  scope.