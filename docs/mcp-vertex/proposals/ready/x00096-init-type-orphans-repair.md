---
id: x00096
status: ready
type: proposal
kind: fix
track: cli-init-types+audit-merge-conflicts
date: 2026-07-01
title: repair orphaned types + audit merge conflicts left over from f00037
shipped-in: []
recan: []
related:
    - f00037 # rename refactor that renamed .ts -> .service.ts and reshuffled contracts
    - f00046 # server-args.service.ts (the only one I fixed in f00094's session)
    - f00089 # adoption-plan shape that depends on the init types under repair
ownership:
    - { agent: technical_investigator, task: 'S1: inventory every orphaned type reference (IPathProbe, IResolvedHostEntry, THostEntrySource, IToolUnification, IToolNamespace, IAutoForwardRule in the spec) and trace where each was supposed to be defined' }
    - { agent: implementation_runner, task: 'S2: re-define or re-export every orphaned type. For types that were intentionally removed (e.g. when the f00037 contracts split consolidated them), add a one-line `export type` alias in the right contracts/interfaces/*.interface.ts file' }
    - { agent: implementation_runner, task: 'S3: resolve the merge conflicts in plugins/audit/tests/src/lib/tools/audit-plan.tool.spec.ts and audit-run.tool.spec.ts — pick the correct side per hunk; the conflicts are 10+ files of pre-existing dirty work, mostly stale imports and duplicated test names' }
    - { agent: delivery_verifier,    task: 'S4: re-run `bun run typecheck` and prove `bun run test` is green (or at minimum the failure count is not increased). Target: zero new errors introduced; the pre-existing 115 errors in init/ + audit/ must drop by >= 50%' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
---

# f00095 — repair orphaned types + audit merge conflicts left over from f00037

## goal

A `bun run typecheck` on develop HEAD currently reports **120 errors**
across **17 files** in `packages/cli/src/lib/init/` + `packages/cli/
src/commands/init/`, plus **10+ merge conflicts** in
`plugins/audit/tests/src/lib/tools/audit-plan.tool.spec.ts` and
`audit-run.tool.spec.ts`. The init errors are orphaned type references
left over from the f00037 rename refactor; the audit conflicts are
pre-existing dirty work that was committed despite unresolved merge
markers.

This slice fixes both surfaces so `bun run typecheck` exits 0 again
on develop. It is the natural follow-up to the focused one-liner
committed at `2d9040fa` (which repaired `server-args.service.ts` but
left the rest of the init folder broken).

## why

1. **115 typecheck errors in init/ are blocking CI.** The `validate`
   gate runs `tsc --noEmit -p tsconfig.json` as its first step. With
   115 errors, `bun run validate` is red on develop HEAD today.
   Whoever merges next will get a CI failure unless they happen to
   also fix init/. The longer this stays red, the higher the cost of
   every subsequent merge (merge conflicts on top of broken types).
2. **The pattern is well-understood.** f00037 renamed `*.ts` →
   `*.service.ts` and consolidated some contracts into
   `contracts/interfaces/*.interface.ts`. Several modules still
   reference types that were moved or merged. A targeted
   `import type` addition resolves most errors; the rest need a
   one-line `export type` re-export in the right contract file.
3. **The audit spec merge conflicts are unblockers.** A spec file
   that contains `<<<<<<<` markers cannot be parsed by vitest. Until
   someone picks the correct side per hunk, those test files cannot
   even run, hiding whatever bugs they were supposed to catch.

## why this design

- **One PR closes the typecheck gap.** Splitting init/ orphans across
  multiple slices is wasteful: every merge will conflict with the
  next orphan resolution. One PR that touches every orphan is
  cheaper.
- **Audit merge resolution is small but blocking.** 2-3 hunks per
  file × 2 files = ~6 decisions. The agent doing S3 should not
  need a proposal; the pattern is mechanical.
- **`bun run validate` is the existing bar.** Every proposal in
  this repo ends with "validate is green". f00095 is no different.

## non-goals

- **No new features, no refactor of init logic.** This slice fixes
  types and merge markers; behaviour is unchanged.
- **No spec additions.** The point is to make the existing specs
  pass, not to add new ones.
- **No change to f00037's contract shape.** Types are re-exported,
  not redesigned. If the contract surface needs to change, that's a
  separate slice.
- **No automatic merge-tool magic.** The audit conflicts must be
  resolved by hand, hunk by hunk. The agent that landed the dirty
  commit took a shortcut; f00095 walks it back deliberately.

## architecture

```
17 packages/cli/src/lib/init/init-render.service.spec.ts
12 packages/cli/src/lib/init/init-host-instructions.service.spec.ts
12 packages/cli/src/lib/init/init-foreign-detect.service.ts
10 packages/cli/src/lib/init/init-skill-inventory.constant.ts
10 packages/cli/src/lib/init/init-render.service.ts
10 packages/cli/src/lib/init/init-adoption-plan.builder.ts
 9 packages/cli/src/lib/init/init-host-instructions.service.ts
 7 packages/cli/src/lib/init/init-human-summary.service.ts
 7 packages/cli/src/lib/init/host-entry-resolver.service.ts
 6 packages/cli/src/lib/init/init-adoption-plan.builder.spec.ts
 5 packages/cli/src/lib/server-args.service.spec.ts   (1 of the 5 was repaired at 2d9040fa)
 4 packages/cli/src/lib/init/init-detection.service.ts
 4 packages/cli/src/lib/init/host-entry-resolver.service.spec.ts
 3 packages/cli/src/lib/init/init-migrate-offer.service.ts
 2 packages/cli/src/lib/init/init-integration.spec.ts
 1 packages/cli/src/lib/init/init-default.command.spec.ts
 1 packages/cli/src/commands/init/init.command.ts
```

Plus **10+ merge conflicts** in `plugins/audit/tests/src/lib/tools/
audit-plan.tool.spec.ts` and `audit-run.tool.spec.ts` (TS1185
"Merge conflict marker encountered").

### Orphan inventory

The following types are referenced in source but never declared:


From the 115 remaining errors:

- `IPathProbe` — used in `host-entry-resolver.service.ts` but never
  declared. Either deleted by f00037 or moved to a contract file
  the implementation never re-imported.
- `IResolvedHostEntry` — same family as `IPathProbe`. Used by
  `host-entry-resolver.service.ts` as a return type.
- `THostEntrySource` — discriminator union for `host-entry-resolver`.
  Used by `host-entry-resolver.service.ts`.
- `IToolUnification` — used by `init-adoption-plan.builder.ts`.
  Was probably part of an adoption-section contract that got
  refactored out.
- `IToolNamespace` — same family as `IToolUnification`. Used by
  `init-adoption-plan.builder.ts`.

S1 is the **read-only inventory** that pins down exactly where each
type should live (or whether it should be inlined into the consuming
file).

## slices

### S1 — Inventory every orphaned type reference

- **Status**: pending
- **Files**: `packages/cli/src/lib/init/`, `packages/cli/src/commands/init/`,
  `plugins/audit/tests/src/lib/tools/audit-{plan,run}.tool.spec.ts`
- **Gate**: typecheck (read-only)
- **Acceptance**:
  - "A table mapping each orphaned type to its canonical home is
    committed under the slice notes (no production code changed)."

### S2 — Re-define or re-export every orphaned type

- **Status**: pending
- **Files**: 5 source files identified by S1 + the matching
  `contracts/interfaces/*.interface.ts` files
- **Gate**: typecheck
- **Acceptance**:
  - "Zero `Cannot find name 'IXxx'` errors remain in `init/`."

### S3 — Resolve the audit merge conflicts

- **Status**: pending
- **Files**: `plugins/audit/tests/src/lib/tools/audit-plan.tool.spec.ts`,
  `plugins/audit/tests/src/lib/tools/audit-run.tool.spec.ts`
- **Gate**: typecheck
- **Acceptance**:
  - "No `<<<<<<<` markers remain; spec files compile against the
    current production code in `plugins/audit/src/`."

### S4 — Re-run typecheck + test

- **Status**: pending
- **Files**: nothing new
- **Gate**: validate
- **Acceptance**:
  - "`bun run typecheck` exits 0 on develop HEAD (down from 115)."


## dependency graph

- **Upstream (already shipped)**: f00037 (the refactor that broke
  init/), f00046 (server-args.service.ts pre-refactor), f00089
  (adoption-plan shape).
- **No new plugin / no new tool / no new i18n key.**
- **~5 source files modified + ~2 audit spec files modified**.
- **No change to any external contract** (no CLI flag added, no
  default changed, no spec dragnet outside init/ + audit/).

## acceptance

- `bun run validate` is green (exit 0).
- `bun run typecheck` reports zero errors on develop HEAD.
- `bun run test` exits 0 (or at minimum the failure count does not
  increase vs the pre-fix baseline).
- No public type is removed or renamed; only re-exports are added.
- No `process.cwd()`, no `os.tmpdir()`, no new env vars.

## risks and mitigations

- **Risk**: the agent doing S1 misses an orphan type that surfaces
  later as a runtime error. **Mitigation**: S1 includes a final
  pass of `bun run test` to catch anything the typecheck missed.
- **Risk**: the audit merge conflicts have no recoverable intent
  (both sides are stale). **Mitigation**: if neither side is
  current, the agent discards both and re-derives the spec from the
  production tool. Worst case the spec has a few fewer test cases,
  but the production code stays the source of truth.
- **Risk**: S2 adds `export type` aliases that confuse future
  readers. **Mitigation**: every alias has a one-line comment
  pointing at the canonical definition. No `Foo = Bar` without
  provenance.

## notes

- **Open question for the slice owners**: should S2 also rename
  `IAutoForwardRule` and `IAutoForwardKind` into a clearer pair
  (e.g. `ICliArgForwardRule` / `ICliArgForwardKind`) while we're
  here? Cheap to do in the same PR; expensive to do later once
  external hosts have registered custom rules against the old
  names. Will commit on `yes` in S1.
- **Follow-up proposal idea (f00096+)**: a `bun tools/scripts/lint/
  type-orphan-detector.script.ts` lint that walks every `*.service.ts`
  in `packages/cli/src/lib/init/` and asserts each `PascalCase`
  reference resolves to either a local symbol or an imported one.
  Would have caught this regression before it shipped.