---
id: q00026
title: "vitest 5 major migration planned after SQLite consolidation"
kind: plan
status: review
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
last-transition-id: 8042eaa5-7920-408e-a544-1e859d864359
last-correlation-id: 8042eaa5-7920-408e-a544-1e859d864359
last-transition-from: in-progress
last-transition-at: 2026-10-11T16:24:48.698Z
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

- **Status**: retired
- **Files**:
  - `tools/scripts/vitest/preflight.ts`
  - `tools/scripts/vitest/preflight.spec.ts`
  - `docs/delendai/vitest-preflight.md`
- **Gate**: lint
- retired-reason: the inventory was to tell S2 and S3 where the new major would break. Run on 2026-10-11, the migration broke no test — 16,259 tests in 1,954 files pass unchanged on vitest 5.0.3, and the coverage summary keeps its shape — and the two things it did change were found by the gates in minutes (the reporter's type import, S2; the setup files in the coverage report, S3), so a script and a document listing touch points would describe a risk that did not materialise and would have to be maintained for no reader. What the run did find is recorded where it is acted on (S3, S4).
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — vitest 4.1.11 → 5.0.3 in every workspace

- **Status**: review
- **Files**:
  - `package.json`
  - `bun.lock`
  - `extensions/vscode/package.json`
  - `packages/cli/package.json`
  - `packages/client/package.json`
  - `packages/context-compiler/package.json`
  - `packages/contracts/package.json`
  - `packages/core/package.json`
  - `packages/proposals-sqlite/package.json`
  - `packages/roadmap-sqlite/package.json`
  - `packages/roadmap/package.json`
  - `packages/state-sqlite/package.json`
  - `packages/state-telemetry/package.json`
  - `packages/state/package.json`
  - `packages/test-kit/package.json`
  - `packages/ui-extension/package.json`
  - `plugins/adaptive-optimizer/package.json`
  - `plugins/agent-orchestrator/package.json`
  - `plugins/audit-orchestrator/package.json`
  - `plugins/audit/package.json`
  - `plugins/auto-agent-selector/package.json`
  - `plugins/auto-plugin-selector/package.json`
  - `plugins/cache/package.json`
  - `plugins/changelog/package.json`
  - `plugins/commit-policy/package.json`
  - `plugins/completion/package.json`
  - `plugins/context-for-change/package.json`
  - `plugins/conventions/package.json`
  - `plugins/database/package.json`
  - `plugins/deps/package.json`
  - `plugins/diagram/package.json`
  - `plugins/docs/package.json`
  - `plugins/env/package.json`
  - `plugins/error-reporting/package.json`
  - `plugins/execution-env/package.json`
  - `plugins/external-mcps/package.json`
  - `plugins/forge/package.json`
  - `plugins/framework-knowledge/package.json`
  - `plugins/git/package.json`
  - `plugins/github/package.json`
  - `plugins/gitlab/package.json`
  - `plugins/i18n/package.json`
  - `plugins/impact-analysis/package.json`
  - `plugins/issues-triage/package.json`
  - `plugins/issues/package.json`
  - `plugins/link-check/package.json`
  - `plugins/logs/package.json`
  - `plugins/memory/package.json`
  - `plugins/notification/package.json`
  - `plugins/orchestrator-runner/package.json`
  - `plugins/perf/package.json`
  - `plugins/project-health/package.json`
  - `plugins/project-kpis/package.json`
  - `plugins/prompt-eval/package.json`
  - `plugins/proposals/package.json`
  - `plugins/quality-policy/package.json`
  - `plugins/quality/package.json`
  - `plugins/remote-provider-core/package.json`
  - `plugins/rules/package.json`
  - `plugins/search/package.json`
  - `plugins/security/package.json`
  - `plugins/self-learning/package.json`
  - `plugins/skills-pack/package.json`
  - `plugins/status-marker/package.json`
  - `plugins/tech-debt/package.json`
  - `plugins/test-convention/package.json`
  - `plugins/test-policy/package.json`
  - `plugins/usage-tracking/package.json`
  - `plugins/web-fetch/package.json`
  - `tools/package.json`
  - `docs/delendai/DEPENDENCY-VERSIONS.md`
  - `tools/scripts/test/journal-reporter.ts`
- **Gate**: type
- shipped-in: `c7d546899551`, `e5b76ed1a0a6`, `08e13ad56bfd`
- acceptance:
  - Every manifest that pinned `vitest` 4.1.11 pins 5.0.3 (68 workspaces and the root), the lockfile is regenerated, and the governed default in `DEPENDENCY-VERSIONS.md` says so: `bun run lint:dependency-versions` reports no unjustified drift.
  - The whole suite passes with no spec changed: 16,259 tests in 1,954 files.
  - `tools/scripts/test/journal-reporter.ts` still appends one line per run with the same shape. Its types changed home: vitest 5 no longer exports `vitest/reporters`, so `Reporter` comes from `vitest/node` with the other reporter types, and the run-end reason is typed `TestRunEndReason`. No behaviour changed.
  - The target is 5.0.3, the current patch of the major the plan named as 5.0.0.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — @vitest/coverage-v8 4.1.11 → 5.0.3, and the one counting difference

- **Status**: review
- **Files**:
  - `package.json`
  - `bun.lock`
  - `vitest.config.ts`
- **Gate**: type
- shipped-in: `c7d546899551`, `6e71dbe9e9d3`
- acceptance:
  - `@vitest/coverage-v8` moves with `vitest` in the same commit: version 5 of one requires version 5 of the other, so there is no installable state in between and the two bumps are not separable as the plan first drew them.
  - `vitest run --coverage --coverage.reporter=json-summary` writes `.cache/coverage/coverage-summary.json` with the same shape; `coverage-ratchet.script.ts` and `no-dead-modules.script.ts` read it unchanged.
  - vitest 5 reports the setup files every project loads when `coverage.include` matches them; vitest 4 left them out by itself. They are excluded in `vitest.config.ts` from the same list the projects load them from, and `bun run lint:no-dead-modules` passes.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — re-measure coverage + re-tighten ratchet thresholds

- **Status**: review
- **Files**:
  - `vitest.config.ts`
  - `docs/delendai/coverage-ratchet.md`
- **Gate**: lint
- shipped-in: `6e71dbe9e9d3`
- acceptance:
  - Coverage is measured twice on a clean `.cache/coverage`: 87.26 / 75.02 / 88.89 / 88.93 and 87.25 / 75.00 / 88.88 / 88.92 (statements / branches / functions / lines).
  - Each floor is `floor(lower reading − 1.0)`: 82 → 86, 69 → 74, 83 → 87, 83 → 87. No floor is lowered.
  - `bun tools/scripts/coverage-ratchet.script.ts` exits 0 after the edit, and `bun run test:coverage` passes with the new floors.
  - `docs/delendai/coverage-ratchet.md` carries the table of readings and why the floors moved.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — verify CI parity (lint, typecheck, biome-baseline, dead-modules)

- **Status**: review
- **Files**:
  - `docs/delendai/DEPENDENCY-VERSIONS.md`
- **Gate**: lint
- shipped-in: `e5b76ed1a0a6`
- acceptance:
  - `bun run lint:dependency-versions` exits 0 with no unjustified drift: the one gate the bump regressed, fixed by the governed table.
  - `bun run lint:no-dead-modules` exits 0, and `bun run test:coverage` exits 0 with the S4 floors.
  - The lint chain the publication runs, the typecheck and the biome baseline pass on the candidate; the pull request's required check is the evidence.
- review-state: in_review
- review-implementer: claude-opus-5-5

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

S1 was retired; S2 and S3 landed as one commit, because coverage-v8 5
requires vitest 5 and vitest 5 requires coverage-v8 5: neither bump
installs without the other. S4 and S5 follow it.


## Acceptance

This plan is **done** when the four delivered slices above (S1 was
retired) are merged into `develop`, the ratchet thresholds are tightened (or left alone) per
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
