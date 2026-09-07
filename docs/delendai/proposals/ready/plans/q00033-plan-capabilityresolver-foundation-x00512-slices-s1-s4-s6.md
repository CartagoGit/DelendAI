---
id: q00033
title: "Plan: CapabilityResolver foundation (x00512 slices S1–S4 + S6)"
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

This plan groups the S1–S4 + S6 slices of x00512 into four executable
linear orderings because the files overlap. Each linear ordering is a
single proposal slice.

## Linear ordering (single agent)

1. **S1** — `capability-resolver.ts` + `.error.ts` + `.spec.ts` (one
   slice). Files disjoint from S2, S3, S4.
2. **S2** — single-flight in
   `tool-surface-runtime.service.ts`. Disjoint from S1.
3. **S3** — `compact-router.tool.ts` consumed the S1 resolver. After S1
   lands this becomes a one-file change to swap bodies.
4. **S4** — `resolve-capability.tool.ts` (new) plus
   `bootstrap-core-tool-ids.constant.ts` (one-line add).
5. **S6** — generic test suite added on top of S1 (additional cases;
   S1 ships with 4 baseline cases, S6 brings the count to 12+).

S5, S7, S8 are tracked as future work; they do not block this plan.

## Acceptance

- All S1–S4 + S6 acceptance criteria from x00512 are green.
- `bun run validate` runs end-to-end on `develop`.
- HEAD is one atomic commit ahead of `origin/develop` (or several
  atomic per-slice commits; preferred).
- No commit message contains `create_proposal` / `proposals`
  domain leakage unrelated to where it was already present.

## Files inventory

The plan modifies / adds these files only (no others):

| File | Slice |
|---|---|
| `packages/core/src/lib/dispatch/capability-resolver.ts` | S1 (new) |
| `packages/core/src/lib/dispatch/capability-resolver.error.ts` | S1 (new) |
| `packages/core/src/lib/dispatch/capability-resolver.spec.ts` | S1 (new) |
| `packages/core/src/lib/project/tool-surface-runtime.service.ts` | S2 (modify) |
| `packages/core/tests/src/lib/project/tool-surface-runtime.single-flight.spec.ts` | S2 (new) |
| `packages/core/src/lib/tools/compact-router.tool.ts` | S3 (modify) |
| `packages/core/src/lib/tools/resolve-capability.tool.ts` | S4 (new) |
| `packages/core/src/lib/contracts/constants/bootstrap-core-tool-ids.constant.ts` | S4 (modify) |
| `packages/core/src/lib/cli/assemble-core-tools.ts` | S4 (modify) |
| `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts` | S6 (extend) |
| `packages/core/tests/src/lib/dispatch/router-auto-activate.spec.ts` | S3 (new) |

## Why these files are disjoint

The slices were designed to be file-disjoint except for S3 (which
reads the S1 module) and S2 (which mutates a method called by S1).
When S1 lands, S2 and S3 each take one file. S6 only adds test code,
not new production code paths.

When S1 and S2 are both in flight, the only overlap is
`tool-surface-runtime.service.ts` (S2 owns) and the new dispatch
module (S1 owns). They are separate files. When S3 lands it touches
`compact-router.tool.ts` only.

## Concurrency rule for parallel agents

- Slice S1 exclusive-owns:
  `packages/core/src/lib/dispatch/capability-resolver*.ts`.
- Slice S2 exclusive-owns:
  `packages/core/src/lib/project/tool-surface-runtime.service.ts`
  and its test counterpart.
- Slice S3 exclusive-owns:
  `packages/core/src/lib/tools/compact-router.tool.ts` and its test.
- Slice S4 exclusive-owns the new resolve-capability.tool.ts file.
- Slice S6 only adds tests under
  `packages/core/tests/src/lib/dispatch/`.

No slice should touch the other slices' files.
