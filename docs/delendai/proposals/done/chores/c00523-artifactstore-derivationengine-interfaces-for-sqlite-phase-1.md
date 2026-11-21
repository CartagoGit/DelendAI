---
id: c00523
title: "ArtifactStore + DerivationEngine interfaces for SQLite Phase 1"
kind: chore
status: done
type: proposal
track: state-engine
date: 2026-09-06
priority: P1
shipped_commit_sha: pending-cascade-archive
shipped_at: 2026-09-06
related:
    - q00018 # state-engine foundation
    - q00019 # state-engine phase 1 SQLite — these interfaces land the SQLite shadow
    - c00514 # purity lint — `ArtifactStore` is the ONLY allowed writer to the durable layer
    - c00522 # Context Compiler — composes the DerivationEngine
    - c00515 # fail-closed reasons — `ArtifactStore.put` failures surface as `state_store_*`
---

# c00523 — ArtifactStore + DerivationEngine interfaces for SQLite Phase 1

## Goal

The user's briefing lists five core interfaces for the next big
refactor:

```
interface WorkspaceSnapshotter { snapshot(): Promise<WorkspaceSnapshot>; }
interface ArtifactStore         { put(input): Promise<ArtifactRef>; get(ref): Promise<Artifact>; }
interface DerivationEngine      { derive<T>(key, snapshot): Promise<T>; }
interface KnowledgeIndex        { resolve(query): Promise<KnowledgeRef[]>; }
interface ContextCompiler       { compile(request): Promise<ContextManifest>; }
```

`ContextCompiler` is c00522. `WorkspaceSnapshotter` exists today
in `packages/core/src/lib/workspace/`. This proposal introduces
**`ArtifactStore`** and **`DerivationEngine`** as the two missing
primitives, plus a **`KnowledgeIndex`** skeleton.

These are the abstractions the SQLite Phase 1 driver (q00019 S1)
implements, so producers (Phase 5) stay pure and the storage
adapter is the **only** writer to the durable layer (c00514's
strict purity contract).

## why

The user's invariant: "Git CAS → snapshots → derivation DAG →
SQLite → Context Compiler → lazy refs". The DerivationEngine is
the DAG; the ArtifactStore is the persistence layer; the
KnowledgeIndex is the queryable catalogue over both.

The hard separation matters because:

- Producers become **pure transformations**: `derive(generation:
  proposals, snapshot)` reads from the ArtifactStore, computes,
  returns the new artifact. No producer touches the durable layer
  directly.
- The store becomes **the single point of persistence**: the
  reconciliation engine, the git exporter, and the SQLite shadow
  all go through `ArtifactStore.put`. The purity lint in c00514
  enforces this statically.
- The index becomes **the single point of query**: every
  KnowledgeRef the ContextCompiler emits is a query result, so
  the agent's `expand(ref)` calls route the same index that
  produced the manifest.

## why this design

Each interface is intentionally narrow:

- **`ArtifactStore`** is content-addressed: the ref is
  `hash:kind`. Same hash, same content; the store dedupes by
  default. Phase 0 ships the in-memory + filesystem backend; q00019
  S1 ships the SQLite backend.
- **`DerivationEngine`** is a function from
  `(key, snapshot) → artifact`. The key encodes the producer's
  inputs, parser version, and producer version, so the engine
  can answer "I already have this result" without re-running.
- **`KnowledgeIndex`** is the queryable layer over both. It
  resolves `(kind, query)` to `KnowledgeRef[]` (which then route
  to `ArtifactStore.get`). The Phase 1 SQLite backend adds FTS5
  for free-text queries.

## Tasks

### S1 — The interfaces

`packages/state/src/lib/artifact/`:

- `artifact-store.interface.ts`:
  ```ts
  export interface IArtifactStore {
    put(input: ArtifactInput): Promise<ArtifactRef>;
    get<T = unknown>(ref: ArtifactRef): Promise<T>;
    has(ref: ArtifactRef): Promise<boolean>;
  }
  ```
- `derivation-engine.interface.ts`:
  ```ts
  export interface IDerivationEngine {
    derive<T>(key: DerivationKey, snapshot: SnapshotRef): Promise<T>;
    invalidateUpstreamOf(ref: ArtifactRef): Promise<readonly ArtifactRef[]>;
  }
  ```
- `knowledge-index.interface.ts`:
  ```ts
  export interface IKnowledgeIndex {
    resolve(query: KnowledgeQuery): Promise<readonly KnowledgeRef[]>;
    describe(ref: KnowledgeRef): Promise<KnowledgeDescriptor>;
  }
  ```

All branded types use `@delendai/state/util/brand.ts`.

### S2 — The Phase 0 in-memory + filesystem backend

`packages/state/src/lib/artifact/in-memory-backend.ts`:

- `createInMemoryArtifactStore()` returns an `IArtifactStore`
  backed by a `Map<hash, content>`.
- `createFilesystemArtifactStore(rootAbs)` returns an
  `IArtifactStore` backed by `.cache/delendai/objects/<aa>/<bb>/…`
  (the Git-style content-addressed layout from the briefing).
- `createInMemoryDerivationEngine(store)` returns an
  `IDerivationEngine` that memoises results by `(key, snapshot)`
  in memory.

### S3 — The fingerprint integration

The DerivationEngine's `DerivationKey` is composed of:

- The producer's `id` + `producerVersion` + `abiVersion` (already
  in `IProducerFingerprintEntry`).
- The producer's `inputs[]` resolved to their `digest`s.
- The parser version for any post-processing.

This composes directly with the existing
`fingerprintFromResolved` in `packages/state/src/lib/fingerprint.ts`.
No new fingerprint logic is needed.

### S4 — Tests

`packages/state/tests/src/artifact/`:

- `artifact-store.spec.ts` — `put` then `get` round-trips; `has`
  returns the correct boolean; dedupe by content hash.
- `derivation-engine.spec.ts` — `derive` returns memoised results
  on repeated calls with the same key; `invalidateUpstreamOf`
  returns the transitive closure.
- `knowledge-index.spec.ts` — `resolve` returns refs that route
  to the underlying store; `describe` returns the descriptor.

### S5 — KnowledgeIndex skeleton (Phase 1 placeholder)

`packages/state/src/lib/artifact/knowledge-index-placeholder.ts`:

- `createStubKnowledgeIndex()` returns an `IKnowledgeIndex` that
  resolves every query to `[]`. The placeholder documents the
  Phase 1 migration path (q00019 S3 adds the FTS5-backed
  implementation). Today, the Context Compiler emits manifests
  with empty `[]` for KnowledgeIndex results; the API contract
  is in place; the SQLite backend fills it in.

## Acceptance

- The three interfaces exist and exported via
  `@delendai/state/artifact`.
- The Phase 0 backends work end-to-end (put/get, derive, resolve).
- The fingerprint integration is the existing
  `fingerprintFromResolved` (no duplicate logic).
- `bun run validate` stays green.

## Out of scope

- The SQLite backend for `ArtifactStore`. That lands in q00019 S1.
  This proposal defines the contract; q00019 implements it.
- The KnowledgeIndex's FTS5 implementation. That lands in q00019 S3.
- Embeddings inside KnowledgeIndex. Future addition.