---
id: c00514
title: "Implement `state-engine-purity.script.ts` + baseline (the documented-but-missing purity gate)"
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
---

# c00514 — Implement `state-engine-purity.script.ts` + baseline

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

The audit (2026-09-06, "L Sección 4.2") confirmed the file does not
exist (`find tools/scripts/lint -name "*purity*"` returns only
`no-node-imports-in-state.script.ts`). The
`state-engine-purity.baseline.json` allow-list file also does not
exist.

This proposal implements both, with the following invariant the lint
guarantees:

> Every file under `packages/state/src/**` and under
> `plugins/<plugin>/src/lib/state/**` may only write inside
> `.cache/delendai/state/**` or `<swarmRoot>/state/**`. Any other
> write destination is a regression.

## why

Without this lint, the purity invariant is **documented but not
enforced**. A producer that imports `node:fs` and writes to
`process.cwd()` from inside `@delendai/state` would pass `bun run
validate` silently. That is the single regression that q00019's
SQLite shadow is meant to catch at runtime — but the shadow needs
the purity boundary to hold first, otherwise the SQLite driver
becomes a parallel implementation that drifts from the in-memory
one.

This lint is also the gate that closes the "fail-closed SQLite"
invariant the user asked for in the original briefing: a
SQLite-driver that observes the boundary will return
`state_store_unavailable` on a missing DB; a producer that bypasses
the engine is a different kind of bug, but the lint catches it
statically.

## why this design

The lint is purely structural (no LLM call, no fs walks outside the
scope). It uses the same regex pattern as the existing
`no-node-imports-in-state.script.ts:79-90`, plus a path-writes-only
inside-cache check. The baseline JSON follows the same shape as
`tools/scripts/lint/no-node-imports-in-state.baseline.json` so the
existing tooling re-uses without change.

## Tasks

### S1 — The purity lint

`tools/scripts/lint/state-engine-purity.script.ts`:

- Walk every `.ts` / `.tsx` file under
  `packages/state/src/**` and `plugins/<plugin>/src/lib/state/**`.
  Skip `.d.ts`, `.spec.ts`, `.cache/**`, `dist/**`, `node_modules/**`.
- For each file, scan for:
  1. Direct I/O: `fs.writeFile`, `fs.writeFileSync`,
     `node:fs/promises.writeFile`, `Bun.write`, etc.
  2. Calls whose resolved path lives outside
     `.cache/delendai/state/` and `<swarmRoot>/state/`.
- For every match, exit 1 with
  `file:line:col [rule-name] snippet`.
- Accept a `--update` flag that writes the
  `state-engine-purity.baseline.json` allow-list (same pattern as
  `no-node-imports-in-state.baseline.json`).

### S2 — The isolation lint

`tools/scripts/lint/state-engine-isolation.script.ts`:

- Walk every `.ts` file under
  `packages/state/src/**`.
- For each file, assert that it does NOT import any of: `node:*`,
  `@delendai/core`, `@delendai/state-sqlite`.
- (Phase 1 of q00019 introduces `packages/state-sqlite/`; that
  package is allowed to import `node:*` but MUST NOT be imported
  by `packages/state/src/**`.)

### S3 — Baseline

`tools/scripts/lint/state-engine-purity.baseline.json`:

```json
{
  "version": 1,
  "rules": [
    { "rule": "writes-outside-cache", "allow": [] }
  ]
}
```

Initially empty (the contract is "any write outside the cache is a
violation" and there should be zero legitimate writes outside the
cache in Phase 0).

### S4 — Wire into validate

Add both lint scripts to the `bun run validate` matrix in
`package.json#scripts` (mirroring `no-node-imports-in-state`).

### S5 — Spec coverage

`tools/scripts/lint/state-engine-purity.script.spec.ts` +
`tools/scripts/lint/state-engine-isolation.script.spec.ts` — assert
the scripts exit 1 on synthetic fixtures that contain
`fs.writeFileSync("/etc/passwd", "...")` and exit 0 on the
canonical Phase 0 surface.

## Acceptance

- `tools/scripts/lint/state-engine-purity.script.ts` +
  `.spec.ts` + `.baseline.json` exist and exit 0 on the current
  Phase 0 surface.
- `tools/scripts/lint/state-engine-isolation.script.ts` +
  `.spec.ts` exist and exit 0.
- `bun run validate` invokes both as part of the pre-commit gate.
- The companion q00019 slice S5 (isolation lint) lands as a
  follow-up once `@delendai/state-sqlite/` is added.

## Out of scope

- Implementing `@delendai/state-sqlite` itself — that is q00019.
- Extending `IHydrateFailureReason` with fail-closed reasons — see
  c00515.