# `@delendai/state` — State Engine contracts + in-memory driver

> Phase 0 of [`q00018`](../../docs/delendai/proposals/ready/plans/q00018-plan-state-engine-foundation-pure-deterministic-project-swarm-scopes.md).

Pure-TypeScript package that defines the four scopes of the
DelendAI State Engine (`project` / `swarm` / `shared-content-cache` /
`worktree-cache`), the producer contract (`IStateProducer`),
the canonical state hash, and an in-memory driver
(`InMemoryStateRegistry`) for tests and prototypes.

Phase 1 (separate package, `@delendai/state-sqlite`) will introduce
the SQLite driver behind the same `IStateRegistry` contract. Phase 0
ships **without** SQLite and **without** any Node import in the
contracts surface.

## Hard invariants

1. **Pure hydration.** `hydrate()`, `rebuild()`, `reconcile()`,
   `ensureStateCurrent()` and every other State Engine operation is
   **pure with respect to the project**. They may only write inside
   the DelendAI cache (`.cache/delendai/state/**` or
   `<swarmRoot>/state/**`). They MUST NOT mutate Git, Markdown,
   code, or durable configuration. The lint
   `tools/scripts/lint/state-engine-purity.script.ts` enforces this.
2. **Determinism ≠ correctness.** Two machines with the same
   `ProjectFingerprint` and the same operation sequence must
   produce the same `canonicalStateHash` (convergence). Whether the
   resulting state matches the *intended* projection is a separate
   property verified by the reference-implementation suite and the
   property tests.
3. **`incremental ≡ cleanRebuild`.** For every supported mutation
   sequence the incremental path must produce the same canonical
   hash as a clean rebuild. This is the acceptance #1 of the State
   Engine and the gate of Phase 0.

## Subpaths

| Subpath               | Contents                                                    |
| --------------------- | ----------------------------------------------------------- |
| `@delendai/state`     | Barrel with the canonical types                             |
| `@delendai/state/scope` | `IStateScope`, `IScopeLocator`, scope discriminators       |
| `@delendai/state/fingerprint` | `ProjectFingerprint`, `IProducerInput`, helpers    |
| `@delendai/state/producer` | `IStateProducer`, `IProducerContext`                    |
| `@delendai/state/hash`    | `canonicalStateHash`, canonical serialization helpers  |
| `@delendai/state/generation` | `IStateGeneration`, fencing token types             |
| `@delendai/state/registry` | `IStateRegistry`, mutation contracts                  |
| `@delendai/state/driver-in-memory` | `InMemoryStateRegistry` (Phase 0 driver)    |

## Quick start

```ts
import {
  defineInMemoryStateRegistry,
  canonicalStateHash,
  type IStateScope,
  type IStateProducer,
} from '@delendai/state';

const registry = defineInMemoryStateRegistry({ clock: () => 0 });

const proposals: IStateProducer = registry.defineProducer({
  id: 'proposals',
  abiVersion: 1,
  producerVersion: 1,
  inputs: [],
  rebuild(ctx) {
    // Read the proposal markdown files declared in `inputs` and
    // return the canonical projection. Never mutate source.
    return { proposals: [] };
  },
});

const gen = registry.hydrate({
  scope: { kind: 'project', locator: { workspaceRoot: '/r' } },
  fingerprint: registry.computeFingerprint(),
});

const hash = canonicalStateHash(gen.projection);
```