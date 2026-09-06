---
id: c00522
title: "Context Compiler: content-addressed, lazy `expand(ref)`, `ContextManifest` projection"
kind: plan
status: ready
type: proposal
track: state-engine
date: 2026-09-06
priority: P1
related:
    - q00018 # state-engine foundation — Context Compiler is a Phase 5 outcome
    - q00019 # state-engine phase 1 SQLite — Context Compiler reads from the durable layer
    - c00523 # ArtifactStore + DerivationEngine — the primitives Context Compiler composes
    - c00524 # 3-way deterministic reconciliation — Context Compiler can ask for `reconciled_generation`
    - c00525 # tool-result deltas — the deltas that flow INTO Context Compiler
---

# c00522 — Context Compiler: content-addressed, lazy `expand(ref)`, `ContextManifest` projection

## Goal

The user's briefing asks for a way to **pack context** so an LLM can
access all the project's knowledge with **a few tokens at the
start** and lazy-load the rest on demand. The current state-of-the-art
in DelendAI is: every tool returns its raw payload and the model
chains `search.search` / `docs.docs_list` / `logs.tail` / `fs_read`
to reconstruct context. Each of those is a round trip and a
non-trivial payload.

This proposal introduces a **first-class Context Compiler** as a
peer of the State Engine. The compiler takes a `ContextRequest`
(objective + scope + budget + risk) and returns a `ContextManifest`
— a small, content-addressed handle to the knowledge the agent
needs, with each piece referenced by a stable id. The model then
calls `expand(ref, depth)` for the specific pieces it wants.

The shape:

```ts
interface IContextRequest {
  readonly objective: string;          // free text, e.g. "Complete F00507"
  readonly scope: 'project' | 'swarm' | 'shared-content-cache' | 'worktree-cache';
  readonly snapshot: SnapshotRef;       // current head/tree/dirty
  readonly budget: {
    readonly inputTokens: number;      // current prompt budget
    readonly reserveOutputTokens: number;
  };
  readonly risk: 'low' | 'medium' | 'high';
}

interface IContextManifest {
  readonly id: ContextManifestId;      // 'ctx:v8:7af2'
  readonly objective: string;
  readonly snapshot: SnapshotRef;
  readonly invariants: readonly InvariantRef[];
  readonly decisions: readonly DecisionRef[];
  readonly changed: readonly SymbolRef[];
  readonly proposal: readonly ProposalRef[];
  readonly evidence: readonly BlobRef[];
  readonly expandable: number;          // count of refs the model can `expand()`
  readonly budgetUsed: number;
}

interface IContextCompiler {
  compile(request: IContextRequest): Promise<IContextManifest>;
  expand(ref: ContextRef, depth: 'name' | 'summary' | 'source'): Promise<unknown>;
}
```

The model receives the manifest (a few hundred tokens for a typical
objective) and only spends on the pieces it actively needs.

## why

The user's briefing lists "empaquetar contexto y que los llm lo
tengan con poquisimo gasto y puedan reproducir y usar" as a top
priority. The current `compact_router` + `project_context` shape is
a step in that direction but only collapses the bootstrap surface;
the agent still has to fetch context manually. The Context Compiler
collapses the **whole** project knowledge into a single manifest
that the model can carry without re-fetching.

The briefing also flags that compression (gzip, base64) is the
**wrong** mechanism because tokenisation does not preserve
information density. The right mechanism is **reference + lazy
resolve**, which is exactly what `ContextManifest + expand(ref)`
provides.

## why this design

Five ideas compose:

1. **Content-addressed references** — every ref is `kind:hash`. Same
   hash, same content; the agent never re-fetches.
2. **Lazy expansion** — `expand(ref, 'name')` returns the ref's
   label (1-3 tokens). `expand(ref, 'summary')` returns a
   precomputed summary (~50 tokens). `expand(ref, 'source')`
   returns the full source. The model picks the right depth per
   call.
3. **Stable, byte-identical stable prefix** — invariants and
   decisions never change for a given snapshot, so the rendered
   prefix can hit the provider's prompt-cache (OpenAI cache hits
   when the prefix is byte-identical across requests). The
   objective + deltas live in the volatile suffix.
4. **Budget-aware** — the compiler knows the input budget and
   reserves output. When the manifest is already 80% of the
   budget, it drops the lower-priority evidence refs and surfaces
   "context truncated" to the model so the model can request an
   explicit expansion.
5. **Provider-agnostic** — the compiler emits a manifest, not a
   rendered prompt. A separate `IRenderAdapter` for OpenAI /
   Anthropic / local models converts the manifest to the minimum
   text needed. The compiler doesn't know about tokenizers.

This is the architecture the user's briefing asks for ("Git CAS →
snapshots → derivation DAG → SQLite → Context Compiler → lazy
refs").

## Tasks

### S1 — The contract

`packages/state/src/lib/context/manifest.interface.ts` (new):

- `IContextRequest`, `IContextManifest`, `IContextCompiler`,
  `ContextManifestId`, `ContextRef`, `InvariantRef`, `DecisionRef`,
  `SymbolRef`, `ProposalRef`, `BlobRef`, `IRenderAdapter`.
- All branded types follow the `@delendai/state/util/brand.ts`
  pattern.

### S2 — The compiler facade

`packages/state/src/lib/context/compiler.ts` (new):

- `createContextCompiler(deps: { producerRegistry, derivationEngine,
  artifactStore })` returns an `IContextCompiler`.
- `compile()` builds the manifest by querying the
  `DerivationEngine` for the cheap derivations
  (`invariants:list`, `decisions:list`, `proposals:list`) and
  handing each piece through `ArtifactStore.get`. Total budget
  is enforced; lower-priority refs are dropped with a
  `truncated: true` flag.
- `expand()` looks up the ref in the `ArtifactStore` and returns
  the depth-appropriate projection. `'source'` reads from Git
  (the canonical source); `'summary'` reads from the
  precomputed summary artefact.

### S3 — The render adapter (OpenAI example)

`packages/state/src/lib/context/renderers/openai.adapter.ts` (new):

- A minimal renderer that emits the manifest as
  ```
  @ctx <id>

  objective: <objective>
  snapshot: <head_sha> (tree <tree_sha>, dirty <dirty_hash>)

  invariants: <ref1>, <ref2>, ...
  decisions:  <ref3>, ...
  ...
  ```
- The renderer is **byte-stable** for the invariants / decisions /
  changed blocks when the snapshot is the same — the variable
  block is the objective / deltas.

### S4 — Wire into the compact router

`packages/core/src/lib/tools/compact-router.tool.ts` adds:

- Domain `context` action `compile`: returns the manifest.
- Domain `context` action `expand`: returns the requested piece.

(Existing `project_context` action stays as the bootstrap surface;
`context.compile` is the agent's primary entry point once the
manifest is preferred.)

### S5 — Tests

- `packages/state/tests/src/context/manifest.spec.ts` —
  round-trip the branded types.
- `packages/state/tests/src/context/compiler.spec.ts` —
  `compile()` on a synthetic snapshot returns a manifest with
  budgetUsed ≤ request.budget.inputTokens; `expand()` returns the
  precomputed summary; `expand(..., 'source')` returns the source.
- `packages/core/tests/src/tools/compact-router-context.spec.ts` —
  the compact router resolves `context.compile` and
  `context.expand` to the right tool handlers.

### S6 — Token-budget dashboard update

`docs/delendai/TOKEN-BUDGETS.md` adds a new row for
`context.compile` showing the manifest's typical byte size for a
real-world snapshot (measured by the new benchmark in c00521).

## Acceptance

- `IContextCompiler.compile()` returns a manifest within budget.
- `IContextCompiler.expand()` returns the depth-appropriate
  projection.
- The OpenAI renderer's stable-prefix block is byte-identical
  across two `compile()` calls on the same snapshot.
- The compact router resolves `context.compile` / `context.expand`.
- `bun run validate` stays green.

## Out of scope

- The renderers for Anthropic / local models. The OpenAI adapter
  ships as a reference; others land as follow-ups.
- Embeddings / semantic search inside `expand()`. The compiler is
  deterministic; semantic search is a future addition.
- The DerivationEngine implementation. That is c00523.
- The 3-way reconciliation engine that produces
  `reconciled_generation`. That is c00524.