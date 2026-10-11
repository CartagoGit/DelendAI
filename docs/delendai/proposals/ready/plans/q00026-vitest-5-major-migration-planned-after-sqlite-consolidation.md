---
id: q00026
title: "vitest 5 major migration planned after SQLite consolidation"
kind: plan
status: ready
type: proposal
track: dependencies
date: 2026-09-07
priority: P2
source:
  - type: dependabot-pr
    pr: 64
    branch: dependabot/npm_and_yarn/development-2d18962577
    superseded_by: develop (commit 7909e5e44)
related:
  - q00022
  - q00023
  - q00024
  - q00025
  - r00047
  - r00048
  - r00050
  - f00514
  - f00518
blocks:
  - the next dependabot/npm_and_yarn/development-* PR can land cleanly once this is done
---

# q00026 — vitest + @vitest/coverage-v8 4.x → 5.0.0 planned migration, blocked on SQLite consolidation

## Goal

Land the two deferred Dependabot majors (`vitest` 4.1.11 → 5.0.0 and
`@vitest/coverage-v8` 4.1.11 → 5.0.0) as a coordinated migration that
preserves the existing ratchet invariants (`coverage-ratchet`,
`biome-baseline`, `proposal-folder-drift`, `proposal-ready-to-close`) and
ships without a coverage gap, without a flake window, and without
breaking the SQLite-backed proposals DB that is about to land.

The PR #64 Dependabot batch proposed both majors together with 4 patch
bumps and 4 already-applied updates. The patch bumps were merged in
[7909e5e44](https://github.com/CartagoGit/DelendAI/commit/7909e5e44);
the two majors were intentionally deferred because:

1. vitest 5 + coverage-v8 5 change enough APIs (`expectTypeOf`,
   `toMatchObject` defaults, snapshot format, reporter wire protocol)
   that a one-line Dependabot bump would either fail CI or — worse —
   pass CI while silently breaking the coverage gate that every
   `close_slice` / `proposal_transition` call relies on.
2. The proposals plugin is in the middle of an SQLite consolidation
   (q00022 → q00023 → q00024 → f00514 → f00518 → r00050, plus r00047
   / r00048 / f00511 / f00521). Until those land, every test run
   touches both the legacy `proposals/INDEX.json` indexer and the new
   `.delendai/state/proposals.sqlite` writer. Bumping vitest at the
   same time as that dual-write window would scramble the diagnosis
   if any of the two change sets introduced a flake.

This proposal therefore blocks itself on the SQLite consolidation
finishing first, then runs as a self-contained slice that bumps the
two majors, updates any breaking APIs the repo actually exercises,
re-measures coverage, and re-tightens the ratchet thresholds.

## why

> Dependabot PR #64 (closed) proposed both majors together with 4
> patch bumps. The patches were merged in 7909e5e44; the majors were
> deferred. The next dependabot run will open a fresh PR with the
> two majors alone, and that PR will fail CI the moment a `close_*`
> tool is exercised against the SQLite-backed proposals DB — unless
> the migration is planned first.

The two majors are not isolated bumps: vitest 5 ships a new reporter
wire protocol, a new default for `pool` per file, a stricter default
for `toMatchObject` (no longer permissive of unknown keys), and a
breaking snapshot directory layout under `__snapshots__/`. coverage-v8
5 ships its own breaking change: the `v8` provider now requires
`@vitest/coverage-v8` to be a peer of the same `vitest` major
(already the case in this repo) AND a `--coverage.include` glob that
starts at a workspace root, not the configured `root`. The repo's
current `vitest.config.ts` uses a project-aware `include` list (see
`coverage.include` in [vitest.config.ts](vitest.config.ts#L156-L167))
that already follows that rule, so the include list itself does NOT
need rewriting — but the `provider: 'v8'` constant does need a sanity
check after the bump, and any `reporter: ['text-summary',
'json-summary']` consumer (`tools/scripts/coverage-ratchet.script.ts`
reads the `json-summary`) needs its JSON shape verified against the v8
5 layout.

The reason this is a plan, not a feat, is that it owns the
*coordination*: which workspace upgrades first, which slice re-runs
the coverage suite to refresh the ratchet, and which slice re-takes
the snapshot serializer. None of those moves change runtime
behaviour, but each is a meaningful gate that needs its own slice
with its own acceptance.

## why this design

**Block on SQLite consolidation.** The clúster q00022 → q00025 +
f00514 + f00518 + r00047 + r00048 + r00050 is what makes the
proposals plugin's tests both authoritative and reproducible. Bumping
vitest at the same time as that consolidation is in flight would
make every red CI ambiguous: was it vitest, or the SQLite cutover?
The proposal waits for `proposals_db_doctor` (f00518) and the
incremental-to-shadow reconcile (q00024) to land, then runs.

**Self-contained, no behavioural changes.** Every slice in this plan
touches only `package.json`, `bun.lock`, `vitest.config.ts`,
`vitest.shared.ts`, the `tools/scripts/test/journal-reporter.ts`
custom reporter, and the few `.spec.ts` files that use the
breaking-API surface. No source under `packages/*/src` or
`plugins/*/src` is touched, except where the snapshot serializer
needs to be re-taken (one slice, gated by `bun run test:coverage`
showing the same percentages ± drift).

**Re-measure coverage, then re-tighten the ratchet.** The ratchet
policy in [vitest.config.ts](vitest.config.ts#L119-L132) is
`floor(measured − 1.0)` per metric. vitest 5's snapshot format
change can move the percentages by a fraction of a point on the
`packages/state/tests/**` suite (which has many snapshot files).
After the bump, this plan re-runs `bun run test:coverage
--coverage.reporter=json-summary` once, compares the new
percentages to the current thresholds (statements 82, branches 69,
functions 83, lines 84 as of 2026-08-29), and either leaves the
thresholds alone (if percentages stayed the same ± drift) or
applies `floor(measured − 1.0)` and commits the ratchet update as
its own slice. This keeps the ratchet invariant "never lower a
threshold below its current value" intact.

**Single major bump per slice, not a combined bump.** Each vitest
5 / coverage-v8 5 change is its own slice so the diff is bisectable.
If S3 (coverage-v8 5) breaks, S2 (vitest 5) can be reverted
independently.

## non-goals

- Do NOT change any runtime API under `packages/*/src` or
  `plugins/*/src`. The bump is dev-only.
- Do NOT take the opportunity to migrate from vitest 4 to vitest 5
  *and* rewrite the custom reporter. The reporter moves in a
  separate slice and only if the wire protocol change forces it.
- Do NOT raise the coverage thresholds in this proposal. The ratchet
  only tightens when measured coverage actually goes UP; this plan
  re-measures first and only tightens if measured ≥ current.
- Do NOT touch the `vitest.shared.ts` `Alias` interface unless
  vitest 5 changes where `Alias` is exported from. (Last verified:
  in vitest 4 it's exported from `vitest/config`; if vitest 5 keeps
  it there, this file is untouched.)
- Do NOT rebase the SQLite consolidation off `develop` to fit this
  migration. If SQLite lands AFTER this plan starts, the plan
  pauses; it does not race.

## architecture

The migration touches six surfaces:

1. **Workspace pins** — every `vitest` pin in `package.json` and
   the 13 workspace `package.json` files that pin `vitest: 4.1.11`.
2. **Coverage provider** — `coverage.provider: 'v8'` and the
   `coverage.include` / `coverage.exclude` / `coverage.reporter`
   block in [vitest.config.ts](vitest.config.ts#L156-L167).
3. **Custom reporter** — `tools/scripts/test/journal-reporter.ts`,
   only if vitest 5 changed the reporter wire protocol.
4. **Snapshot files** — every `.snap` file under any `__snapshots__/`
   directory in the repo, only if vitest 5 changed the snapshot
   serialisation format. The preflight (S1) inventories them.
5. **Coverage consumers** — `coverage-ratchet.script.ts` and
   `no-dead-modules.script.ts`, only if coverage-v8 5 changed the
   `json-summary` schema. Both are isolated to `tools/scripts/`.
6. **Ratchet thresholds** — the `coverage.thresholds` block in
   `vitest.config.ts`, only tightened (never lowered) after S4's
   re-measurement.

Nothing else is in scope.

## Slices

- global_gate: lint

### S1 — preflight inventory: snapshot files, reporter consumers, and pool config

- **Status**: pending
- **Files**:
  - `tools/scripts/vitest/preflight.ts` (new — emits a JSON report
    to `.cache/vitest-preflight.json` listing every `.snap` file in
    the repo, every spec that uses `toMatchSnapshot` /
    `toMatchInlineSnapshot`, every spec that sets `pool` /
    `forks` / `threads` / `vmThreads`, and every consumer of the
    custom `journal-reporter.ts`)
  - `tools/scripts/vitest/preflight.spec.ts` (new)
  - `docs/delendai/vitest-preflight.md` (new — human-readable
    companion to the JSON; lists the breaking-API touch points
    this plan will land on S2 / S3)
- **Gate**: lint
- acceptance:
  - `bun tools/scripts/vitest/preflight.ts` writes
    `.cache/vitest-preflight.json` with `{ snapshotFiles: number,
    specsUsingSnapshot: number, specsSettingPool: number,
    reporterConsumers: string[] }`.
  - The script exits 0 and prints a one-line summary on stdout.
  - The companion doc lists, by workspace, every `.snap` file with
    > 5 entries (the most likely to flake under a format change).
  - This slice does NOT bump anything. It only inventories.
  - The slice is intentionally independent of the SQLite
    consolidation timing — it can land before SQLite ships,
    because it does not touch any source or test under
    `packages/proposals-sqlite/`. It blocks S2.

### S2 — vitest 4.x → 5.0.0 + report / fix breakages

- **Status**: pending
- **Files**:
  - `package.json` (bump `vitest: 4.1.11` → `vitest: 5.0.0`)
  - `bun.lock` (regenerated)
  - All workspace `package.json` files where `vitest` is pinned to
    `4.1.11` (12 files: `packages/cli`, `packages/client`,
    `packages/context-compiler`, `packages/contracts`,
    `packages/core`, `packages/proposals-sqlite`,
    `packages/state-sqlite`, `packages/state`,
    `packages/test-kit`, `packages/ui-extension`, and 2 plugin
    workspaces) — each bumped to `vitest: 5.0.0`
  - `extensions/vscode/package.json` (bump `vitest: 4.1.11` → 5.0.0)
  - `tools/scripts/test/journal-reporter.ts` (only IF vitest 5
    changed the reporter wire protocol — verify against the
    preflight from S1)
  - Any `.spec.ts` file the run flags as breaking on the new
    `toMatchObject` semantics (expect ≤ 3 files based on the
    preflight inventory; the fix is to pass `{ exact: false }` or
    switch to explicit field lists — see S2 acceptance)
  - `docs/delendai/vitest-preflight.md` (updated with the actual
    breakages observed during S2)
- **Gate**: type
- acceptance:
  - `bun install` produces a clean lockfile (no peer-dep warnings
    from coverage-v8 yet; S3 adds the matching coverage-v8 5).
  - `bun run typecheck` exits 0.
  - `bunx vitest run --no-coverage packages/core packages/state
    packages/test-kit packages/proposals-sqlite
    packages/state-sqlite` (the suites most likely to exercise
    snapshot + reporter APIs) exits 0 — every breaking spec has
    been fixed in place, with each fix scoped to the breaking
    API only.
  - `bun run lint:biome-baseline` does not regress (the bump
    itself does not change biome; this is a regression check).
  - `tools/scripts/test/journal-reporter.ts` is unchanged iff
    vitest 5's reporter protocol is the same as 4.x; otherwise the
    slice lands the minimum diff that keeps
    `.cache/delendai/results/logs/test-runs.jsonl` appending
    one line per run with the same shape as before the bump.
  - This slice does NOT touch `@vitest/coverage-v8`; that is S3.

### S3 — @vitest/coverage-v8 4.x → 5.0.0 + report / fix breakages

- **Status**: pending
- **Files**:
  - `package.json` (bump `@vitest/coverage-v8: 4.1.11` → 5.0.0)
  - `bun.lock` (regenerated)
  - `vitest.config.ts` (verify `coverage.provider: 'v8'` and the
    `coverage.include` / `coverage.exclude` / `coverage.reporter`
    list are still accepted; the current shape is already
    compatible with coverage-v8 5 based on a static read, but the
    slice verifies it at runtime)
  - `tools/scripts/coverage-ratchet.script.ts` (only IF coverage-v8
    5 changed the `json-summary` schema that the ratchet parses —
    verify against the S1 preflight)
  - `tools/scripts/lint/no-dead-modules.script.ts` (same IF —
    that lint reads per-file function counts from the same JSON)
  - Any other consumer of
    `.cache/coverage/coverage-summary.json` identified by the S1
    preflight (likely ≤ 2 files)
  - `docs/delendai/vitest-preflight.md` (updated with the actual
    breakages observed during S3)
- **Gate**: type
- acceptance:
  - `bun install` produces a clean lockfile with coverage-v8 5 as
    a peer of vitest 5.
  - `bun run typecheck` exits 0.
  - `bunx vitest run --coverage --coverage.reporter=json-summary`
    completes against the repo's existing
    `coverage.include` list (the same one in
    [vitest.config.ts](vitest.config.ts#L156-L167)) and writes
    `.cache/coverage/coverage-summary.json` with the same top-level
    keys (`total`, per-file entries) as before. If the schema
    changed, `coverage-ratchet.script.ts` and
    `no-dead-modules.script.ts` are patched in the same commit.
  - `bun tools/scripts/coverage-ratchet.script.ts` exits 0 with
    the existing thresholds (statements 82, branches 69,
    functions 83, lines 84) — i.e. the ratchet does not regress.
    If the measured percentages moved but stayed ≥ threshold, the
    thresholds are NOT yet touched (S4 owns that).
  - `bun run lint:no-dead-modules` exits 0.
  - This slice lands on the S2 commit, not on `develop` directly,
    so the bisect remains clean: revert S3 alone keeps vitest 5
    + coverage-v8 4 if needed.

### S4 — re-measure coverage + re-tighten ratchet thresholds

- **Status**: pending
- **Files**:
  - `vitest.config.ts` (the `coverage.thresholds` block; updated
    with the new `floor(measured − 1.0)` values)
  - `docs/delendai/coverage-ratchet.md` (updated with the
    re-measurement table: previous run, new run, drift per
    metric, and the rationale for each threshold change)
  - `.cache/coverage/coverage-summary.json` (regenerated as part
    of the run, not committed — listed here for completeness so
    the slice is bisectable)
- **Gate**: lint
- acceptance:
  - The slice runs
    `bunx vitest run --coverage --coverage.reporter=json-summary
    --coverage.reportOnFailure=true` once on a clean
    `.cache/coverage` and records the four metric percentages.
  - Each of the four thresholds is either:
    - left at its current value if `floor(measured − 1.0) ≤
      current`, OR
    - raised to `floor(measured − 1.0)` if that value is strictly
      greater than the current threshold.
  - No threshold is ever lowered. This is the ratchet invariant;
    the slice documents it in the commit message.
  - `bun tools/scripts/coverage-ratchet.script.ts` exits 0 after
    the threshold edit.
  - `docs/delendai/coverage-ratchet.md` lists the previous
    percentages, the new percentages, and the rationale.

### S5 — verify CI parity (lint, typecheck, biome-baseline, dead-modules)

- **Status**: pending
- **Files**:
  - none expected; if any gate regresses, this slice lands the
    minimum fix and the diff is documented in the commit message
- **Gate**: lint
- acceptance:
  - `bun run lint` exits 0.
  - `bun run typecheck` exits 0.
  - `bun tools/scripts/lint/biome-baseline.script.ts` reports
    "no regressions" (or the existing baseline SHRANK — never
    grew — relative to its S4 value).
  - `bun run lint:no-dead-modules` exits 0.
  - `bun run lint:dependency-versions` exits 0 with no unjustified
    drifts.
  - `bun run lint:proposals` exits 0 (no proposal-file drift
    introduced by the bump).
  - `bun run test:coverage` exits 0 with the S4 thresholds.

## Dependency graph

```text
sqlite consolidation (q00022 → q00025 + f00514 + f00518
                  + r00047 + r00048 + r00050 + f00521)
        │
        │ ALL in `done/` AND `proposal-folder-drift` clean
        ▼
q00026 S1 — preflight inventory + branch
q00026 S2 — vitest 4.x → 5.0.0 + report / fix breakages
q00026 S3 — @vitest/coverage-v8 4.x → 5.0.0 + report / fix breakages
q00026 S4 — re-measure coverage + re-tighten ratchet thresholds
q00026 S5 — verify CI parity (lint, typecheck, biome-baseline, dead-modules)
```

S1–S5 are sequential (each one can break the next's assumptions).
S2 and S3 are themselves atomic — S3's branch must start from S2's
HEAD because coverage-v8 5's peer requirement on vitest 5 means S3
without S2 produces a non-installable lockfile.


## Acceptance

This plan is **done** when all five slices above are merged into
`develop`, the ratchet thresholds are tightened (or left alone) per
S4's invariant, and the next Dependabot weekly run opens a fresh
PR whose only remaining work is whatever new majors land AFTER
vitest 5 / coverage-v8 5 (none expected for vitest / coverage-v8
in the next 12 months).

## risks and mitigations

1. **vitest 5 reporter wire change** — if the wire protocol
   changed, the journal-reporter may need a non-trivial rewrite.
   Mitigation: S1 inventories every reporter consumer; S2 lands
   the minimum diff.
2. **coverage-v8 5 JSON schema change** — if the `json-summary`
   schema moved, `coverage-ratchet.script.ts` and
   `no-dead-modules.script.ts` would need patching. Mitigation:
   same as above — S1 inventories, S3 patches.
3. **Snapshot format churn** — vitest 5 may emit a different
   default snapshot key, forcing a one-time regeneration of every
   `.snap` file in the repo. Mitigation: S1 inventories, S2
   regenerates only the affected files (and accepts that this is a
   one-shot, large-but-mechanical change). If the regeneration
   moves the snapshot line count by ≥ 10% across the suite, the
   slice pauses and we re-discuss.
4. **Ratchet drift on first run** — vitest 5 may shift measured
   coverage by ± 2-3 percentage points on suites that use
   `toMatchSnapshot` heavily (the v8 provider's branch-coverage
   tracking on assertion failures has changed in past majors).
   Mitigation: S4 documents the drift and only tightens if
   measured ≥ current.
5. **Race with SQLite consolidation** — if SQLite ships AFTER this
   plan starts, S2's run will exercise the new SQLite-backed
   proposals code under vitest 5 for the first time. Any failure
   will be ambiguous. Mitigation: this plan **blocks** on SQLite
   being `done/` (see Dependency graph), so the race is excluded
   by design.

## Notes

- The original Dependabot PR #64 was closed (not merged) with a
  comment that documents the 8 already-applied updates and the 2
  deferred majors. This plan is the second half of that work.
- A new Dependabot weekly run will open a fresh PR for the same
  two majors once this plan is done; that PR should land cleanly
  on top of q00026.
- The `preflight` slice (S1) is intentionally landable BEFORE the
  SQLite consolidation finishes — it does not touch any source or
  test under `packages/proposals-sqlite/`. Landing S1 early
  unblocks anyone who wants to start the inventory work in
  parallel.
- `vitest.shared.ts` may need a one-line touch if vitest 5 moves
  `Alias` to a new export location; the slice that owns that
  touch is the one that bumps vitest (S2), and the diff is
  expected to be ≤ 1 line.
