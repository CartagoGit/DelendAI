---
id: c00514
title: "Implement `state-engine-purity.script.ts` + baseline (strict contract: zero persistent I/O outside storage adapters)"
kind: chore
status: ready
type: proposal
track: state-engine
date: 2026-09-06
priority: P0
related:
    - c00510 # the parent hardening round
    - q00018 # state-engine foundation — purity invariant is acceptance criterion #1
    - q00019 # state-engine phase 1 SQLite — purity lint MUST land before SQLite shadow can be enabled
    - x00504 # digest honesty — the contract gap that the new lint will close
    - c00523 # ArtifactStore + DerivationEngine interfaces for SQLite Phase 1
---

# c00514 — Implement `state-engine-purity.script.ts` + baseline (STRICT contract)

## Goal

`tools/scripts/lint/state-engine-purity.script.ts` is **referenced by
four independent sources** but does not exist:

- `packages/state/README.md:23` — "The lint
  `tools/scripts/lint/state-engine-purity.script.ts` enforces this."
- `packages/core/src/lib/plugins/plugin-contract.ts:202-205` — "The
  lint enforces the boundary statically."
- `q00018` plan §S6 — pending slice.
- `q00019` plan §S5 — pending slice, calls for a companion
  `state-engine-isolation.lint.ts`.

The audit (2026-09-06, "L §4.2") confirmed the file does not exist.
The `state-engine-purity.baseline.json` allow-list file also does
not exist.

The post-commit review (2026-09-06, c00510 retro) **tightened the
contract** significantly: the earlier draft proposed to allow
writes under `.cache/delendai/state/**` / `<swarmRoot>/state/**`
from `packages/state/src/**` and from
`plugins/<plugin>/src/lib/state/**`. The reviewer pointed out this
opens the door to "producer.rebuild() → fs.writeFile(...)" which
**recreates the two-truths anti-pattern** the user explicitly
asked to avoid.

The strict contract this proposal enforces is:

> **Producers are pure transformations. Only storage adapters
> persist.** Concretely:
>
> - Every file under `packages/state/src/**` MAY NOT import
>   `node:fs*`, `node:fs/promises`, `Bun.write`, `better-sqlite3`,
>   `bun:sqlite`, or any other persistent I/O API.
> - Every file under `plugins/<plugin>/src/lib/state/**` MAY NOT
>   either.
> - The ONLY places allowed to touch the durable layer are the
>   storage adapter (q00019 S1), the reconciliation engine (q00018
>   Phase 5), and the git exporter. These live under
>   `packages/state-sqlite/**`, `packages/core/src/lib/state/reconcile/**`,
>   and `packages/core/src/lib/state/git-exporter/**` respectively.
> - Phase 0 (this proposal) enforces the no-I/O rule for
>   `packages/state/src/**` only; q00019 S5 extends the rule to
>   the state-sqlite package and introduces the
>   `state-engine-isolation.lint.ts` companion.

This is stronger than "writes only inside the cache": it removes
the ambiguity about "is this producer supposed to write
`.cache/delendai/state/foo`?" by saying "no, no producer writes
anywhere; storage adapters write via `ArtifactStore.put` only".

## why

Without this lint, the purity invariant is **documented but not
enforced**. A producer that imports `node:fs` and writes to
`process.cwd()` from inside `@delendai/state` would pass
`bun run validate` silently. That is the single regression that
q00019's SQLite shadow is meant to catch at runtime — but the
shadow needs the purity boundary to hold first, otherwise the
SQLite driver becomes a parallel implementation that drifts from
the in-memory one.

The strict contract also future-proofs the SQLite migration: when
Phase 2 of q00018 promotes the SQLite driver from shadow to
primary, the producers will already be pure. The runtime then has
exactly two layers that touch disk: the storage adapter (the new
canonical layer) and the reconciliation engine (the transition
path). The git exporter is the only writer to the durable git
history. There are no other layers that could drift.

## why this design

The lint is purely structural (no LLM call, no fs walks outside
the scope). It uses the same pattern as the existing
`no-node-imports-in-state.script.ts:79-90`. The baseline JSON
follows the same shape as
`tools/scripts/lint/no-node-imports-in-state.baseline.json` so the
existing tooling re-uses without change.

The strict (vs permissive) contract simplifies the lint: instead
of pattern-matching "is this write path inside the cache?", the
lint just checks for any import of a forbidden module. The
behaviour is unambiguous; the allow-list is empty; the surface
area is small.

## Tasks

### S1 — The purity lint

`tools/scripts/lint/state-engine-purity.script.ts`:

- Walk every `.ts` / `.tsx` file under `packages/state/src/**`
  (Phase 0 scope; q00019 S5 extends to `plugins/<plugin>/src/lib/state/**`).
- Skip `.d.ts`, `.spec.ts`, `.cache/**`, `dist/**`,
  `node_modules/**`.
- For each file, scan for any import of:
  ```
  node:fs
  node:fs/promises
  node:fs/*
  Bun.write
  better-sqlite3
  bun:sqlite
  pg / mysql / any database client
  ```
- For every match, exit 1 with
  `file:line:col [purity-violation] snippet`.
- Accept a `--update` flag that writes the
  `state-engine-purity.baseline.json` allow-list (same pattern as
  `no-node-imports-in-state.baseline.json`).
- The lint is **bootstrap-time only** — runs in `bun run validate`,
  not on every commit.

### S2 — The isolation lint

`tools/scripts/lint/state-engine-isolation.script.ts`:

- Walk every `.ts` file under `packages/state/src/**`.
- For each file, assert that it does NOT import any of:
  - `@delendai/core` (the engine is supposed to be host-agnostic).
  - `@delendai/state-sqlite` (Phase 1 sibling, one-way import).
- (q00019 S5 introduces the same lint for
  `packages/state-sqlite/src/**`, allowing `node:*` there but
  forbidding back-imports from `packages/state/`.)

### S3 — Baseline

`tools/scripts/lint/state-engine-purity.baseline.json`:

```json
{
  "version": 1,
  "rules": [
    { "rule": "no-persistent-io-in-pure-layer", "allow": [] }
  ]
}
```

Initially empty (the contract is "no persistent I/O in the pure
layer" and there should be zero legitimate exceptions in Phase 0).

### S4 — Wire into validate

Add both lint scripts to the `bun run validate` matrix in
`package.json#scripts` (mirroring `no-node-imports-in-state`).

### S5 — Spec coverage

`tools/scripts/lint/state-engine-purity.script.spec.ts` +
`tools/scripts/lint/state-engine-isolation.script.spec.ts` — assert
the scripts exit 1 on synthetic fixtures that contain
`import { writeFile } from 'node:fs/promises'` and exit 0 on the
canonical Phase 0 surface.

### S6 — Producer contract update

Update the producer interface docstring in
`packages/state/src/lib/producer.ts` to declare explicitly:

```ts
/**
 * IStateProducer — pure transformation of resolved inputs into a
 * canonical projection.
 *
 * The implementation MUST NOT touch persistent storage:
 *   - No `node:fs*` import.
 *   - No `Bun.write` call.
 *   - No `better-sqlite3` / `bun:sqlite` import.
 *   - No `Date.now`, `Math.random`, `process.env`, etc.
 *
 * The single source of persistence is `IArtifactStore.put` (q00019
 * S1). Phase 0 producers are pure functions; SQLite Phase 1
 * moves the durable layer behind `ArtifactStore` and the producers
 * remain pure.
 *
 * Enforced by `tools/scripts/lint/state-engine-purity.script.ts`.
 */
```

The JSDoc replaces the previous "no Node imports" wording so the
intent is unambiguous to future contributors.

## Acceptance

- `tools/scripts/lint/state-engine-purity.script.ts` +
  `.spec.ts` + `.baseline.json` exist and exit 0 on the current
  Phase 0 surface.
- `tools/scripts/lint/state-engine-isolation.script.ts` +
  `.spec.ts` exist and exit 0.
- `bun run validate` invokes both as part of the pre-commit gate.
- The companion q00019 slice S5 (isolation lint extension) lands as
  a follow-up once `@delendai/state-sqlite/` is added.
- Every `.ts` file under `packages/state/src/**` is grep-clean for
  `node:fs` / `Bun.write` / `better-sqlite3` / `bun:sqlite`.

## Out of scope

- Implementing `@delendai/state-sqlite` itself — that is q00019.
- Extending the lint to `plugins/<plugin>/src/lib/state/**` —
  follows once the first plugin defines a producer (today: zero).
- The fail-closed reason extension — that is c00515.