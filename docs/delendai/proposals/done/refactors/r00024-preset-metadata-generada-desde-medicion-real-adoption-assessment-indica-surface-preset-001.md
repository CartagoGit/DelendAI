---
id: r00024
title: "preset metadata generada desde medición real; adoption assessment indica surface (PRESET-001)"
kind: refactor
status: done
type: proposal
track: presets
date: 2026-08-25
parent-plan: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "PRESET-001 — `PRESET_METADATA` mantiene snapshots hardcodeados que ya no representan la surface actual"
shipped-in:
    - a23f45d4 # refactor(presets): generate PRESET_METADATA from a real measurement (r00024)
    - 0bd0d1a9 # fix(presets): generator's raw output never matched Biome-formatted commit
---

# r00024 — preset metadata generada desde medición real; adoption assessment indica surface (PRESET-001)

## Goal

`PRESET_METADATA` (`preset-metadata.constant.ts`) hand-kept a snapshot
(`measuredAt: 2026-08-24`, tool counts `minimal 29, lean 41, standard 80,
swarm 143, full 150, vertex 160`) that `buildAdoptionAssessment()` reused
as if it were current. As soon as any preset's membership changed (as it
just did in Track G, f00177), these numbers silently went stale with no
mechanism to catch it.

## why

PRESET-001 (P2, "CONFIRMADO") in the third external audit. Root cause:
no generator connected `PRESET_METADATA` to a real measurement, so it
could only ever be updated by someone remembering to hand-edit it.

## non-goals

- Does not change `token-budget-dashboard.script.ts`'s own dashboard
  output format (that's r00022/r00023's scope) — it only exports two of
  its existing internals (`DASHBOARD_SURFACES`, `measurePresetDashboard`)
  for reuse, so there is exactly one measurement code path, not two.
- Does not add adaptive-surface numbers to `PRESET_METADATA` — kept to
  the native surface (matching the existing semantic every consumer of
  `PRESET_CATALOG[...].budget` already assumed); `surfaceMode` is
  recorded explicitly so this is no longer an unstated assumption.

## Decision

Split the previous single hand-written constant into two, along the
SOLID line between policy and measurement:

- `preset-roles.constant.ts` — human-authored `PRESET_ROLES` map (what a
  preset is *for*; not a measurement, never touched by a generator).
- `preset-metadata.generated.ts` — fully generated `PRESET_METADATA`,
  written by the new `tools/scripts/generate/preset-metadata.script.ts`,
  which connects a real in-memory MCP client per preset (native surface)
  and measures `tools/list` — the exact same `measurePresetDashboard`
  call the token dashboard makes, exported and reused rather than
  reimplemented. `estimatedTokens` uses the same
  `heuristic-4-bytes-per-token` estimator the tokenizer report already
  names.

## Slices

- global_gate: `bun run typecheck && bunx vitest run packages/core/tests/src/lib/plugins packages/core/tests/src/lib/adopt`

### S1 — generated `PRESET_METADATA` + `PRESET_ROLES` split
- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/preset-budget-profile.interface.ts`
    (adds `IPresetSurfaceMode`, `surfaceMode`/`estimator`/`source` fields;
    drops `role` from `IPresetMetadataEntry`)
  - `packages/core/src/lib/contracts/constants/preset-roles.constant.ts` (new)
  - `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`
    (new, generated; replaces the deleted `preset-metadata.constant.ts`)
  - `packages/core/src/lib/plugins/preset-catalog.ts` (`role:` seeds now
    read `PRESET_ROLES`; updated docstrings)
  - `packages/core/src/lib/plugins/preset-derived.ts` (`derivePresetBudget`
    now threads `surfaceMode`/`estimator` through to `IPresetBudgetProfile`)
- **Gate**: `bun run typecheck` + `bunx vitest run
  packages/core/tests/src/lib/plugins/preset-catalog.spec.ts` (existing
  200 tests, unchanged assertions, still pass)

### S2 — the generator + `check:generated` wiring
- **Status**: done
- **Files**:
  - `tools/scripts/generate/preset-metadata.script.ts` (new)
  - `tools/scripts/report/token-budget-dashboard.script.ts` (exports
    `DASHBOARD_SURFACES` + `measurePresetDashboard` for reuse)
  - `tools/scripts/lint/check-generated-artifacts.script.ts` (new
    `PRESET_METADATA` drift check, `measuredAt` normalized out of the
    comparison the same way the dashboard's own `Generated at:` line is)
  - `package.json` (`generate:preset-metadata` script)
- **Gate**: `bun run check:generated` → "All generated artifacts are in
  sync." (verified twice, a few seconds apart, to confirm the
  timestamp-normalization doesn't produce a false pass/fail)

### S3 — adoption assessment indicates surface
- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/adoption-assessment.interface.ts`
    (`IAssessmentCost.surfaceMode: 'native' | 'adaptive' | 'estimated'`)
  - `packages/core/src/lib/adopt/adoption-assessment.service.ts`
    (`buildCost` now sets `surfaceMode` from the covering preset's budget,
    or `'estimated'` for the fallback-budget path; note text says which
    surface)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/adopt` (existing
  tests pass unchanged — none asserted a specific numeric budget value)

## acceptance

- No manually-kept tool counts: `PRESET_METADATA` is 100% generated by
  `tools/scripts/generate/preset-metadata.script.ts`, deleting the old
  hand-written `preset-metadata.constant.ts`.
- `buildAdoptionAssessment()`'s `cost.surfaceMode` tells the caller which
  surface (`native`/`adaptive`/`estimated`) its budget numbers describe.
- `bun run check:generated` fails the build the moment `PRESET_METADATA`
  drifts from a fresh measurement (verified: re-running the generator
  after Track G's `full`/`cli-tool` membership change picked up the real
  new tool counts — `full` 150→157, `vertex` 160→172 — proving the drift
  detection is live, not decorative).
- `role` (human policy) and measured budget data are structurally
  separated (`PRESET_ROLES` vs `PRESET_METADATA`) so a future preset-role
  edit can never trigger (or hide behind) a generated-artifact diff.
- Real gates green: `bun run typecheck`, `bun run lint:solid` (no new
  findings — `preset-catalog.ts` comment additions trimmed to stay under
  the 400-LOC ceiling), `bun tools/scripts/lint/preset-drift.script.ts`
  (0 findings), `bun run check:generated`, and the 200 tests across
  `packages/core/tests/src/lib/plugins` + `.../adopt` (unchanged, all
  pass).
- No `SafeWorkspaceReader` / `IToolIdentityRegistry` / other shared
  primitive duplicated — this reuses `measurePresetDashboard`,
  `estimateTokensFromBytes`, `withFileMutex`, `writeFileAtomic` from
  existing modules rather than reimplementing any of them.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
