---
id: q00033
title: "Plan: CapabilityResolver foundation (x00512 slices S1–S2 + S4 + S6)"
kind: plan
status: ready
type: plan
track: architecture
date: 2026-09-07
parent: x00512
related:
  - x00512
  - r00043
  - r00041
  - f00507
---

# q00033 — CapabilityResolver foundation plan

## goal

Execute S1, S2, S4 and S6 of `x00512` end-to-end: a
generic `CapabilityResolver`, runtime single-flight activation,
always-visible `delendai_resolve_capability` primitive, and a generic
test suite. Deliver S3 (compact router integration) only after the
`ROUTER_RESULT` schema is tightened (deferred as `x00512 S3.PR`).

## why

x00512 is the architectural foundation for the lazy-load UX fix. Its
S1–S2 + S4 + S6 deliver a generic, domain-agnostic resolver that
hosts can call without knowing about `tool_search` /
`plugin_activate`. The remaining tracks (S3 router, S5 host adapter
parity, S7 skill lazy-loader, S8 doc update) are intentionally
deferred so the foundation lands without regressions.

## non-goals

- Routing the compact router through the resolver (S3 — requires
  schema tightening, deferred to `x00512 S3.PR`).
- Per-host adapter parity audit (S5 — empirical per-host evidence
  needed, future track).
- Skill lazy-loader migration (S7 — depends on S1, future track).
- Generic bootstrap doc update (S8 — only after the foundation has
  shipped and been validated).

## architecture (linear ordering)

A single agent executes these slices in four sequential stages
because each subsequent stage depends on the previous:

1. **S1** — `capability-resolver.{ts,error.ts,identity.ts}` +
   `capability-resolver.spec.ts` (one slice, four new files).
2. **S2** — single-flight in `tool-surface-runtime.service.ts`
   (one-file change, disjoint from S1).
3. **S4** — `resolve-capability.tool.ts` (new) plus
   `bootstrap-core-tool-ids.constant.ts` (one-line add) plus
   `assemble-core-tools.ts` (one registration).
4. **S6** — generic test suite extensions on top of S1 (additional
   cases; S1 ships with the baseline, S6 brings the count to 11).

S3 is captured but not in this plan's linear ordering.

## slices

### S1 — Resolver foundation

- **Status**: done
- **Files**:
  - `packages/core/src/lib/dispatch/capability-resolver.ts`
  - `packages/core/src/lib/dispatch/capability-resolver.error.ts`
  - `packages/core/src/lib/dispatch/capability-resolver.identity.ts`
  - `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`
  - `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts`
- **Gate**: type
- acceptance:
  - The resolver does NOT import or reference any specific plugin id, tool id, namespace, or skill id.
  - `bun run typecheck` and `bun run lint` are green.

### S2 — Single-flight plugin activation

- **Status**: done
- **Files**:
  - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
- **Gate**: type
- acceptance:
  - The runtime's `activatePluginAsync` shares exactly one loader call across concurrent activations of the same `pluginId`.
  - `bunx vitest run tests/src/lib/project/tool-surface-runtime-eviction.spec.ts` continues to pass.

### S4 — Generic primitive `delendai_resolve_capability`

- **Status**: done
- **Files**:
  - `packages/core/src/lib/tools/resolve-capability.tool.ts`
  - `packages/core/src/lib/contracts/constants/bootstrap-core-tool-ids.constant.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
- **Gate**: type
- acceptance:
  - `BOOTSTRAP_CORE_TOOL_IDS` includes `'resolve_capability'`.
  - `buildResolveCapabilityToolRegistration` is wired into `assembleCoreTools`.
  - `bun run typecheck` and `bun run lint` are green.

### S6 — Generic test suite

- **Status**: done
- **Files**:
  - `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts`
  - `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`
- **Gate**: test
- acceptance:
  - 11 tests pass.
  - Synthetic fixtures (`fake_alpha`, `fake_beta`, `fake_gamma`) only. No hardcoded domain id.
  - One test asserts the filesystem-fallback invariant.

## dependency graph

```
S1 foundation
 ├─ S2 single-flight       ── independent of S1 (different file)
 ├─ S4 primitive           ── depends on S1 (uses resolveAndInvoke)
 └─ S6 tests               ── depends on S1 (uses the synthetic fixture)
S3 router (this plan: deferred)
S5 / S7 / S8 (future tracks)
```

## acceptance

- All S1, S2, S4, S6 acceptance criteria from x00512 are green.
- `bun run validate:run` runs end-to-end on `develop` (modulo the
  `commit-policy` informational notice, which is unrelated).
- HEAD is one atomic commit ahead of `origin/develop` (or several
  atomic per-slice commits; preferred).
- No commit message contains a hardcoded plugin id unrelated to
  where it was already present.

## risks and mitigations

- **R1 — Compact-router regression**: routing the router through the
  resolver changes the envelope shape. Mitigation: S3 deferred as
  S3.PR; S4 ships the resolver as a fresh always-visible primitive
  so callers who want to use it today have a path.
- **R2 — Lazy-loader skip risk**: a future plugin whose activation
  throws (e.g. invalid binary) might surface as `activation_failed`
  to the LLM instead of a recoverable hint. Mitigation: the
  resolver preserves the original thrown message in `detail`.
- **R3 — Hardcoding temptation**: developers adding new plugins
  might be tempted to map plugin ids in the resolver. Mitigation: the
  test suite uses synthetic ids and the lint flags
  `lint:no-proposal-id-comments-in-source`.

## notes (file disjointness)

The slices were designed to be file-disjoint so a future
parallel-agent execution could dispatch on them:

| Slice | Exclusive-own files |
|---|---|
| S1 | `packages/core/src/lib/dispatch/capability-resolver*.ts`, `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`, `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts` |
| S2 | `packages/core/src/lib/project/tool-surface-runtime.service.ts` |
| S4 | `packages/core/src/lib/tools/resolve-capability.tool.ts`, `packages/core/src/lib/contracts/constants/bootstrap-core-tool-ids.constant.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts` |

S3 (deferred) would own `packages/core/src/lib/tools/compact-router.tool.ts`
once the `ROUTER_RESULT` schema is tightened.

## definition of done

- `bun run lint:proposals` is green on this file and on `x00512`.
- `bun run typecheck` is green.
- `bun run lint` is green or has only known-pre-existing failures.
- `bunx vitest run packages/core/tests/src/lib/dispatch/` reports
  `Tests 11 passed (11)`.
- `bun run test packages/core` is green.
- HEAD has all four slices committed (or one squash commit if the
  developer prefers atomic-history).

## out-of-scope

- Removing the existing `compact_router` / `tool_search` /
  `plugin_activate` tools.
- Re-platforming to non-MCP transports.
- Removing `proposals`-domain coupling (that's `r00043`).
- Refactoring host adapters (each host is its own track).
