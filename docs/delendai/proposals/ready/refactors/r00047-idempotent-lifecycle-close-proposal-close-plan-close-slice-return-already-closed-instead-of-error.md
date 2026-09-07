---
id: r00047
title: "Idempotent lifecycle — close_proposal/close_plan/close_slice return already_closed instead of error"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-IDEMPOTENT-006
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - r00048
  - f00514
  - x00510
---

# r00047 — Idempotent lifecycle

## Goal

Make `close_proposal`, `close_plan`, and `close_slice` (and the
underlying `proposal_transition` lifecycle verbs) **idempotent under
retry**: calling them N times on an already-closed entity returns
`{ kind: 'already_closed' }` (or the equivalent for the action) instead
of throwing, failing, or corrupting state. The audit marks this as P0
because idempotency is the single most important property that lets
multiple agents retry operations safely.

## Why

The audit lists idempotency as one of the fifteen invariants of
DelendAI:

> Si hago `close("P-123") close("P-123") close("P-123")` el resultado
> debería ser `1 → closed`, `2 → already_closed`, `3 → already_closed`.
> No `2 → error`, ni muchísimo menos `2 → corrupt state`. Lo mismo para
> `create`, `promote`, `reconcile`, `archive`, `complete`, `cancel`.

Today the lifecycle has no explicit idempotency contract: a duplicate
`close` triggers a fresh transition attempt and either fails with a
generic `INVALID_TRANSITION` (which is a refutation, not a success) or
silently overwrites a row that was meant to be terminal. Both behaviours
violate the audit invariant.

The concrete user-reported symptom maps directly: "propuestas que no es
capaz de cerrar" usually happens because an earlier close attempt
half-succeeded (status updated, index not) and the retry hits an
inconsistent intermediate state. Idempotency at the lifecycle boundary
makes this whole class of failure recoverable by design.

## Why this design

**Outcome enum, not exceptions.** Every lifecycle verb has a typed
return shape `{ kind: 'closed' | 'already_closed' | 'conflict' |
'invalid_transition' | 'quarantined' | 'unknown' }`. No throws for
expected outcomes; throws only for unexpected programmer errors
(null-pointer, out-of-memory). Hosts that read the response can decide
whether `already_closed` is a success, an info, or a warning — but they
never see an unhandled exception.

**Single transaction per call.** Each verb opens IMMEDIATE, validates
the entity state + revision (CAS from `r00048`), writes the entity +
lifecycle_events + outbox rows, and COMMITS. No multi-step writes
outside a transaction. No await inside the transaction (LLM is OUT).

**Idempotency key as first-class.** Each verb accepts an optional
`idempotencyKey: string`; if a row with the same key already exists in
`lifecycle_events`, the call returns the stored outcome. This makes
duplicate retries from clients with retry middleware a no-op.

**Append-only lifecycle_events.** The lifecycle log records every
attempt (whether it mutated or was a no-op) so the audit trail stays
complete.

## non-goals

- Do NOT change the public MCP tool names or shapes; only their return
  values gain `kind` discrimination.
- Do NOT add CAS / revision semantics in this proposal — `r00048`
  owns that. The lifecycle verb reads the current revision and compares
  it internally, but does NOT expose the revision on the public surface.
- Do NOT add an outbox processor; `f00514` owns outbox lifecycle
  end-to-end. This proposal only writes the `outbox` rows.
- Do NOT touch the `create_proposal` "auto-create" anti-pattern — that
  is `x00510`.

## Slices

- global_gate: lint

### S1 — Outcome enum + idempotency-key plumbing in the proposals plugin

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/contracts/lifecycle-outcome.contract.ts` (new)
  - `plugins/proposals/src/lib/services/lifecycle-outcome.ts` (new — pure constructor for the discriminated union)
  - `plugins/proposals/src/lib/tools/transition.tool.ts` (modified — accepts `idempotencyKey`)
  - `plugins/proposals/src/lib/tools/close-slice.tool.ts` (modified)
  - `plugins/proposals/src/lib/tools/close-plan.tool.ts` (modified)
  - `plugins/proposals/src/lib/services/close-proposal.service.ts` (new — delegates to the same repo verbs)
  - `plugins/proposals/tests/src/lib/services/close-proposal.service.spec.ts` (new)
  - `plugins/proposals/tests/src/lib/tools/transition.tool.spec.ts` (modified — adds duplicate-call coverage)
- **Gate**: type
- acceptance:
  - `ILifecycleOutcome` is a discriminated union with at least:
    - `closed`, `already_closed`, `conflict`, `invalid_transition`,
      `quarantined`, `unknown`. Each variant carries the relevant
      `entity` snapshot and an optional `previousOutcome` for retries.
  - All three close tools return `ILifecycleOutcome`; they NEVER throw for the documented outcomes.
  - When called twice with the same `idempotencyKey`, the second call returns the stored outcome with `kind: 'already_closed'`.
  - When called twice without an `idempotencyKey` and the entity is already closed, the second call returns `kind: 'already_closed'` (no implicit key, just deterministic detection).
  - Existing tests still pass with the old assertion style.

### S2 — Wire `proposals_close_plan` and `proposals_close_slice` to the same idempotency contract

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/tools/close-plan.tool.ts` (already modified in S1; this slice finishes wiring)
  - `plugins/proposals/src/lib/tools/close-slice.tool.ts` (already modified in S1; this slice finishes wiring)
  - `plugins/proposals/src/lib/services/close-plan.service.ts` (new)
  - `plugins/proposals/src/lib/services/close-slice.service.ts` (new)
  - `plugins/proposals/tests/src/lib/services/close-plan.service.spec.ts` (new)
  - `plugins/proposals/tests/src/lib/services/close-slice.service.spec.ts` (new)
- **Gate**: type
- acceptance:
  - The two services use the same `ILifecycleOutcome` return shape and the same `idempotencyKey` plumbing as `close_proposal`.
  - Closing an already-closed plan/slice is a no-op (`already_closed`); it NEVER throws `INVALID_TRANSITION`.
  - Closing a plan/slice that has unfinished children returns `conflict` (not an exception), and includes the list of unfinished children in the response so the host can decide what to do.
  - All previous close-slice tests still pass.

### S3 — Lifecycle regression suite: closed × N is idempotent under retry, race, and stale-read

- **Status**: pending
- **Files**:
  - `plugins/proposals/tests/src/lib/services/lifecycle-idempotency.spec.ts` (new — focused regression suite)
  - `plugins/proposals/tests/src/lib/services/lifecycle-race.spec.ts` (new — concurrent close attempts)
- **Gate**: e2e
- acceptance:
  - The idempotency suite runs the same `closeProposal` 100x against the same proposal and asserts the FIRST call returns `{ kind: 'closed' }` and the next 99 return `{ kind: 'already_closed' }`.
  - The race suite opens N parallel transactions that try to close the same proposal; exactly one wins with `kind: 'closed'`, the rest get `kind: 'already_closed'`. No data corruption.
  - The stale-read suite reads `revision=N`, then waits for an external write that bumps it to `N+1`, then tries to close with the stale snapshot — the call returns `kind: 'conflict'` and includes the current revision so the host can retry.
  - All three suites run under `bun run test` and stay green.

## acceptance

- All S1-S3 slices land and the focused regression suites pass.
- `close_proposal`, `close_plan`, `close_slice` are documented as
  idempotent in their tool descriptions.
- The audit invariant #4 ("cada mutation es idempotente") is
  demonstrably satisfied for the lifecycle verbs.

## notes

- This proposal is the runtime contract; the storage-layer CAS is
  `r00048`. They are sequenced so the storage layer is read-y first and
  the verbs consume it second.
- The new outcome enum is a public surface change. Hosts reading the
  old `ok: boolean` shape will need to read the new `kind` discriminator.
  A deprecation shim is provided for one minor version in `f00518`.