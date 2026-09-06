---
id: c00524
title: "3-way deterministic reconciliation: `detectDrift` + `applyReconciliationPlan`"
kind: chore
status: ready
type: proposal
track: state-engine
date: 2026-09-06
priority: P1
related:
    - q00018 # state-engine Phase 2 (rebuild) — the work this proposal lands
    - q00019 # state-engine phase 1 SQLite — the storage layer this composes with
    - c00515 # fail-closed reasons — `state_store_stale` is the entry point
    - c00523 # ArtifactStore — the persistence layer the reconciliation engine writes through
---

# c00524 — 3-way deterministic reconciliation: `detectDrift` + `applyReconciliationPlan`

## Goal

The user's briefing calls for separating `detectDrift()` from
`applyReconciliationPlan()` so the reconciliador can answer "what
changed?" without committing to a fix. Today the
`syncProposalRegistry` function in `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`
mutates the filesystem as part of the scan — the audit (B8 / P1)
flagged this as a real hazard.

This proposal introduces the clean separation:

```ts
interface IReconciliationEngine {
  detectDrift(snapshot: SnapshotRef): Promise<IReconciliationPlan>;
  applyReconciliationPlan(plan: IReconciliationPlan): Promise<IReconciliationResult>;
}

interface IReconciliationPlan {
  readonly id: PlanId;
  readonly base: SnapshotRef;          // generation we reconciled against
  readonly current: SnapshotRef;        // generation we are reconciling into
  readonly proposed: SnapshotRef;       // generation the plan would produce
  readonly drifts: readonly IDrift[];   // INSERT / UPDATE / QUARANTINE / STALE
}

type IDrift =
  | { kind: 'insert_proposal'; proposalId: ProposalId; blob: BlobRef }
  | { kind: 'update_proposal'; proposalId: ProposalId; before: BlobRef; after: BlobRef }
  | { kind: 'quarantine_file'; absPath: string; reason: QuarantineReason; blob: BlobRef }
  | { kind: 'retire_proposal'; proposalId: ProposalId; supersededBy: ProposalId }
  | { kind: 'stale_proposal'; proposalId: ProposalId; staleReason: StaleReason }
  | { kind: 'rebuild_required'; reason: 'diverged' | 'unknown' };
```

The `detectDrift` step is **pure** — reads the snapshot, the
ArtifactStore, the KnowledgeIndex, and returns the plan. The
`applyReconciliationPlan` step is **the only writer** to the
durable layer (per c00514).

Structural conflicts (rename of a canonical file, retirement of a
proposal that was already in `done`) resolve without an LLM. Only
**semantic conflicts** (a frontmatter change that the schema
cannot validate, a filename that conflicts with a quarantine rule)
route to the LLM with a small, structured payload.

## why

The user's invariant: "FAIL-CLOSED, no filesystem fallback". Today
the reconciliador mutates the filesystem as part of "what's on
disk right now?" queries. That violates the invariant at the API
level (callers can't ask "what's changed?" without committing to
a fix). The split closes the gap.

## why this design

Three principles:

1. **Detect is pure.** `detectDrift` returns a value; it does not
   write. Callers can inspect the plan, log it, render it, or ask
   the LLM for a review without committing.
2. **Apply is transactional.** `applyReconciliationPlan` runs
   inside `BEGIN IMMEDIATE`; on any failure it ROLLBACKs and the
   previous generation stays ACTIVE. No partial publication.
3. **Conflicts route structurally first.** The reconciliador
   classifies each drift into one of the six kinds above. Only
   `rebuild_required` (and a narrow set of `quarantine_file`
   reasons that need operator judgement) route to the LLM. The
   LLM never sees a structural rename / retire.

The design composes directly with c00523's `ArtifactStore`: the
plan's `BlobRef`s come from the store's `put(input)`; the
reconciliation engine writes them under a single transaction; the
publish step is `canonicalStateHash(plan)` + `acquireLease +
publish` (q00018 Phase 2).

## Tasks

### S1 — The contracts

`packages/state/src/lib/reconcile/`:

- `reconciliation-plan.interface.ts` with the shapes above.
- `reconciliation-engine.interface.ts` with
  `IDriftClassifier`, `IReconciliationEngine`, and the lifecycle
  hooks (`onPlanReady`, `onDriftApplied`, `onFailure`).

### S2 — The drift classifier

`plugins/proposals/src/lib/reconcile/drift-classifier.ts`:

- Pure function `classifyDrift(base: Snapshot, current: Snapshot,
  registry: ReadProposalIndex): readonly IDrift[]`.
- The classifier walks the file list, compares to the registry,
  and emits the matching `IDrift` kinds.
- The classifier NEVER mutates; it never even reads the
  filesystem after the snapshot is taken.

### S3 — The reconciliador facade

`plugins/proposals/src/lib/reconcile/reconciliation-engine.ts`:

- `createReconciliationEngine({ artifactStore, derivationEngine })`
  returns an `IReconciliationEngine`.
- `detectDrift(snapshot)` calls the classifier and returns the
  plan with `canonicalStateHash(plan)` as the `proposed` hash.
- `applyReconciliationPlan(plan)` opens a transaction on the
  underlying SQLite (or the in-memory backend for Phase 0),
  applies each drift through `ArtifactStore.put`, and publishes
  the new generation.

### S4 — Replace `syncProposalRegistry` consumers

The existing `syncProposalRegistry` is split:

- `reconcileAll(workspaceRoot, dryRun: boolean)` — the mutating
  path used by `state_repair`.
- `buildIndexOnly(workspaceRoot)` — the read-only path used by
  `state_health` / `state_diagnose` / `proposal_diagnose`. The
  result is the registered `IReconciliationPlan` with
  `applied: false`.
- Both delegate to the new `ReconciliationEngine`.

### S5 — Tests

- `plugins/proposals/tests/src/lib/reconcile/drift-classifier.spec.ts`
  — classification is deterministic; same input produces the
  same plan; conflict classification routes to the right `IDrift`
  kind.
- `plugins/proposals/tests/src/lib/reconcile/reconciliation-engine.spec.ts`
  — `applyReconciliationPlan` is atomic: half-applied plans leave
  the durable layer untouched.
- `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-split.spec.ts`
  — the read-only `buildIndexOnly` does not mutate the filesystem.

### S6 — Tool surface

`state_health` shows the **last detected** plan (without
applying). `state_repair { action: 'apply_plan', planId }` applies
the operator-approved plan. `state_diagnose` shows the classifier
output without committing.

## Acceptance

- The three contracts exist and are exported.
- The classifier is deterministic (same input → same plan).
- `applyReconciliationPlan` is atomic.
- The read-only `buildIndexOnly` does not mutate the filesystem.
- `bun run validate` stays green.

## Out of scope

- The LLM routing for semantic conflicts. That lands in c00525
  (the deltas pattern) + a follow-up proposal for the conflict
  resolution tool.
- The SQLite transactional layer. That lands in q00019 S1.