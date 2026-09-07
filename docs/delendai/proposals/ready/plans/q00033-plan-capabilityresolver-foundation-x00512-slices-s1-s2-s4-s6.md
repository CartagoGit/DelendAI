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

# q00033 — Plan: CapabilityResolver foundation (x00512 S1–S2 + S4 + S6)

## Goal

Execute S1, S2, S4 and S6 of `x00512` end-to-end: a generic
`CapabilityResolver`, runtime single-flight activation, the
always-visible `delendai_resolve_capability` primitive, and a
generic test suite. Deliver S3 (compact router integration) only
after the `ROUTER_RESULT` schema is tightened (deferred as `x00512
S3.PR`).

## Why

x00512 is the architectural foundation for the lazy-load UX fix. Its
S1–S2 + S4 + S6 deliver a generic, domain-agnostic resolver that
hosts can call without knowing about `tool_search` /
`plugin_activate`. The remaining tracks (S3 router, S5 host adapter
parity, S7 skill lazy-loader, S8 doc update) are intentionally
deferred so the foundation lands without regressions.

## Why this design

A single agent executes these slices in four sequential stages
because each subsequent stage depends on the previous:

1. **S1** — `capability-resolver.{ts,error.ts,identity.ts}` +
   `capability-resolver.spec.ts` (one slice, four new files).
2. **S2** — single-flight in
   `tool-surface-runtime.service.ts` (one-file change, disjoint from
   S1).
3. **S4** — `resolve-capability.tool.ts` (new) plus
   `bootstrap-core-tool-ids.constant.ts` (one-line add) plus
   `assemble-core-tools.ts` (one registration).
4. **S6** — generic test suite extensions on top of S1 (additional
   cases; S1 ships with the baseline, S6 brings the count to 11).

S3 is captured but not in this plan's linear ordering. The slices
were designed to be file-disjoint so a future parallel-agent
execution could dispatch on them; this plan executes them serially
to keep the foundation deterministic and reviewable.

## non-goals

- Routing the compact router through the resolver (S3 — requires
  schema tightening, deferred to `x00512 S3.PR`).
- Per-host adapter parity audit (S5 — empirical per-host evidence
  needed, future track).
- Skill lazy-loader migration (S7 — depends on S1, future track).
- Generic bootstrap doc update (S8 — only after the foundation has
  shipped and been validated).

## Slices

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

## acceptance

- All S1, S2, S4, S6 acceptance criteria from x00512 are green.
- `bun run validate:run` runs end-to-end on `develop` (modulo the
  `commit-policy` informational notice, which is unrelated).
- HEAD is one atomic commit ahead of `origin/develop` (or several
  atomic per-slice commits; preferred).
- No commit message contains a hardcoded plugin id unrelated to
  where it was already present.
- `bun run lint:proposals` is green on this file and on `x00512`.
- `bunx vitest run packages/core/tests/src/lib/dispatch/` reports
  `Tests 11 passed (11)`.

## notes

| Slice | Exclusive-own files |
|---|---|
| S1 | `packages/core/src/lib/dispatch/capability-resolver*.ts`, `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`, `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts` |
| S2 | `packages/core/src/lib/project/tool-surface-runtime.service.ts` |
| S4 | `packages/core/src/lib/tools/resolve-capability.tool.ts`, `packages/core/src/lib/contracts/constants/bootstrap-core-tool-ids.constant.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts` |

S3 (deferred as `x00512 S3.PR`) would own
`packages/core/src/lib/tools/compact-router.tool.ts` once the
`ROUTER_RESULT` schema is tightened.

