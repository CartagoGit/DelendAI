---
id: q00038
title: "Plan: every check runs only for what the change can affect"
kind: plan
status: in-progress
type: proposal
track: ci
date: 2026-11-02
last-transition-id: d07bbe3f-f7e8-4d27-a170-4bb71f44eb27
last-correlation-id: d07bbe3f-f7e8-4d27-a170-4bb71f44eb27
last-transition-from: ready
last-transition-at: 2026-11-02T08:27:41.982Z
shipped-in:
  - "07672aeb0"
  - "81bb8408a"
  - "ec67a86ad"
  - "cbedb634b"
  - "aea829e83"
---

# q00038 — Plan: every check runs only for what the change can affect

## goal

A pull request and a local proof run the tests, lints and types its change can affect, chosen by a dependency analysis that follows symbols and learns what each check reads, so nothing unchanged is checked again and nothing affected is missed.

## why

The owner asked several times that a pull request check only what its change can affect, and the forge did not. Measured on 2026-11-02:

- Tests chose by module. `vitest --changed` follows imports, and nearly every spec imports a barrel that imports everything: one change in core reached 1,362 of 2,407 specs, and `vitest related` took about four minutes to say so.
- Lints ran whole in every pull request, one job per family, whatever changed.
- The local proof used a third answer, a grep for importers, so what passed locally was not what the forge ran.

Followed by symbol, the same core change reaches 240 specs, found in under a second. Over the last 14 merged pull requests the analysis picks between 0 and 503 specs. A mutation of `toolError` passed in all 55 sampled specs the analysis leaves out and failed in the ones it picks.

On 2026-11-04 the owner restated the rule: every validation (tests, lints and types) checks only what the change affects, on the pull request and locally. The rule stands until a configuration says otherwise; there is nothing left to decide. Measured that day:
- `tools/scripts/ci/job-scope.constant.ts` declares every lint job `touches: 'always'`, and the typecheck covers every source prefix.
- `ci.yml` runs the nine static jobs and the typecheck unconditionally.
- The local proof runs the same ten checks, each over the whole repository.

So S1 sectioned the tests, while lints and types still ran in full for a one-file change. S2 and S3 are rewritten from cost-sharing to sectioning, and no longer wait on a decision.

## non-goals

- Dropping the full run on develop: it stays the net for what an analysis cannot see.
- A list kept by hand of what a check reads: it is derived, or measured.
- Making a check weaker to make it faster.

## slices

- global_gate: type

### S1 — Tests run what the change reaches, by symbol
- **Status**: done
- **Files**: `tools/scripts/ci/affected-specs.service.ts`, `tools/scripts/ci/affected-specs.interface.ts`, `tools/scripts/ci/affected-specs.service.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/near-specs.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "A pull request's test jobs run the specs its change reaches, followed by symbol through barrels, and by module from a changed file that runs code when it loads."
  - "A zone the change reaches no spec of starts no job."
  - "The local proof runs the same specs the forge would, from the same analysis."

### S2 — Every lint runs only for the files it reads
- **Status**: pending
- **Files**: `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.script.spec.ts`, `tools/scripts/ci/job-reach.helper.ts`, `tools/scripts/ci/job-reach.helper.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `tools/scripts/lib/changed-files-scope.ts`, `tools/scripts/lib/changed-files-scope.spec.ts`, `tools/scripts/lint/biome-baseline.script.ts`, `tools/scripts/lint/file-conventions.script.ts`, `tools/scripts/lint/no-conflict-markers.script.ts`, `tools/scripts/lint/no-control-bytes.script.ts`, `tools/scripts/lint/no-home-directory-in-tracked-files.script.ts`, `tools/scripts/lint/single-frontmatter.script.ts`, `tools/scripts/lint/type-naming.script.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "No lint job is declared `touches: 'always'` without a measured reason. Each lint family (biome, architecture, presets, docs, security, governance, quality-gate, manifests, generated artifacts) declares the paths it reads, and runs on a pull request and in the local proof only when the change touches them."
  - "A lint that judges files one by one (biome, docs, proposal and naming lints) is given the changed files, not the repository. A repository-wide lint runs only when the change touches what it reads."
  - "A one-file core change runs only the lint families that read core, each over the changed files where it judges files; the run prints which families ran and why the others did not."

### S3 — Types are checked only where the change reaches
- **Status**: pending
- **Files**: `tools/scripts/typecheck.script.ts`, `tools/scripts/ci/typecheck-scope.helper.ts`, `tools/scripts/ci/typecheck-scope.helper.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "The typecheck checks the packages the change touches and the packages that depend on them, through project references or per-package runs with incremental state; a change in one plugin does not typecheck every other plugin."
  - "The local proof and the pull request check the same packages, and the run names them."

### S4 — The saving is measured
- **Status**: done
- **Files**: `tools/scripts/ci/pr-ci-cost.script.ts`, `tools/scripts/ci/pr-ci-cost.script.spec.ts`, `tools/scripts/ci/pr-ci-cost.interface.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "Runner minutes and wall time per pull request are reported before and after each slice."

### S5 — Tools are verified for the plugins the change reaches
- **Status**: done
- **Files**: `tools/scripts/verify/affected-plugins.helper.ts`, `tools/scripts/verify/affected-plugins.helper.spec.ts`, `tools/scripts/verify/plugin-tool-verify.script.ts`, `tools/scripts/ci/affected-specs.service.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "On a pull request, verify:tools verifies the plugins the change reaches by symbol, every plugin when it reaches the harness or a root manifest, and none for a change no plugin loads; a spec covers each case."
  - "A run without --affected-since, as on the integration branch, still verifies every plugin."

### S6 — Each publishable package is packed once
- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "pack smoke no longer runs npm pack --dry-run over the raw workspace directories: the tarball smoke packs every publishable package of the release order from its staged copy, a superset checked on 2026-11-02 (59 of 59 non-private packages)."

### S7 — The external install runs where the packaging can change
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "verify:external-install runs in the pack-smoke job, whose scope now also names its script, the publish staging and init's code; verify-runtime no longer rebuilds and repacks for it."

### S10 — The repository-wide lints cost only what the change changes
- **Status**: pending
- **Files**: `tools/scripts/lib/content-hash.ts`, `tools/scripts/lib/content-hash.spec.ts`, `tools/scripts/compile/build.script.ts`, `tools/scripts/gen-all.script.ts`, `tools/scripts/lint/check-generated-artifacts.script.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `tools/scripts/report/token-budget-report-lib.ts`, `tools/scripts/test/run-actual-preset-budget.script.ts`, `tools/scripts/generate/preset-metadata.script.ts`, `tools/scripts/lint/run-together.script.ts`, `tools/scripts/lint/run-together.script.spec.ts`, `tools/scripts/lint/proposal-cited-commits.script.ts`, `tools/scripts/lint/proposal-cited-commits.script.spec.ts`, `tools/scripts/lint/json-entry-collision.script.ts`, `tools/scripts/lint/no-silent-gates.script.ts`, `tools/scripts/gen-all.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "For a one-file core change, each of lint-security, lint-presets, lint-docs, lint-governance, generated-artifacts-check, tokens-budget-real, quality-gate and the generated-files step of the local proof takes under 10 s, and no check they ran before is dropped."
  - "A lint that judges files one by one judges the changed files (`DELENDAI_CHANGED_FILES`); a lint whose verdict depends on repository-wide inputs keeps its last verdict under a hash of exactly what it reads, and reruns when that hash changes."
  - "CI and the local proof run the same code."

## acceptance

- A pull request's test jobs run the specs its change reaches, followed by symbol through barrels, and by module from a changed file that runs code when it loads.
- A zone the change reaches no spec of starts no job.
- The local proof runs the same specs the forge would, from the same analysis.
- No lint job is declared `touches: 'always'` without a measured reason. Each lint family (biome, architecture, presets, docs, security, governance, quality-gate, manifests, generated artifacts) declares the paths it reads, and runs on a pull request and in the local proof only when the change touches them.
- A lint that judges files one by one (biome, docs, proposal and naming lints) is given the changed files, not the repository. A repository-wide lint runs only when the change touches what it reads.
- A one-file core change runs only the lint families that read core, each over the changed files where it judges files; the run prints which families ran and why the others did not.
- The typecheck checks the packages the change touches and the packages that depend on them, through project references or per-package runs with incremental state; a change in one plugin does not typecheck every other plugin.
- The local proof and the pull request check the same packages, and the run names them.
- Runner minutes and wall time per pull request are reported before and after each slice.
- The external install runs only where packaging or init can change it.

## notes
- 2026-11-02, S2 measured before building: recording what the 47 architecture lints read showed 26 of them call `git` (mostly `ls-files`), which reads the whole tree. Over the last 14 merged pull requests a per-lint selection would still run 31 to 43 of 47, and the lints already run together in 9 s, so the saving would be seconds for a recorder in every bun process. S2 is changed to what does cost: each lint job pays its own checkout and install, about 20 s each.
- On a pull request, verify:tools verifies only the plugins the change can reach, and every plugin on a full run.
- Each publishable package is packed once per run.
- Measured 2026-11-02 on two CLI-only pull requests: before S5/S6 (#1659), 27 jobs, 1,511 runner-seconds and 265 s of wall time, with pack smoke at 180 s and verify-runtime at 149 s; after them (#1666), 25 jobs, 1,157 runner-seconds and 216 s, verify:tools saying that the change reaches no plugin. Of verify-runtime's remaining 136 s, 87 s were `verify:external-install`, which built, packed and installed the published packages again, so S7 moves it to the pack-smoke job.
- S4 `bun run ci:cost -- <pr>` measures each job from its first step start to its last step end (the figures above counted until GitHub marked the job complete, which can be minutes later). Re-measured 2026-11-02: #1659 (before S5/S6) 27 jobs, 1,396 runner-seconds, 263 s wall; #1666 (after) 25 jobs, 1,040 runner-seconds, 214 s wall; #1675 (a docs-and-tooling pull request) 26 jobs, 1,067 runner-seconds, 318 s wall, slowest web site build at 97 s.
- 2026-11-04, S2 and S3 delivered. What each lint family reads was measured by tracing every file its commands opened, less the modules its own scripts import (followed by symbol instead). Architecture, security, governance and the generators read under every tracked top-level entry and stay `always`, with that reason; quality-gate stays `always` because its trace did not complete. Biome, presets, docs and manifests declare what they read and what they list. Every family reads core and the plugins, so a one-file core change or a plugin-only change still runs all of them; a docs-only change skips Biome, the manifests check and the typecheck. The manifests check no longer skips every Markdown-only change: it compares its output with generated pages under docs/delendai. Biome, conflict markers, control bytes, home paths, type naming, file conventions and single frontmatter judge the changed files (`DELENDAI_CHANGED_FILES`); a deletion or rename widens them to the repository. The typecheck checks the workspaces the change touches and their dependents: 71 of 79 for a core change, 11 of 79 for a change in plugins/memory (cold 7.6 s against 13.6 s for everything).
- Measured 2026-11-04, the local fast proof of a one-file core change (`packages/core/src/lib/shared/compute-slot.service.ts`), cold caches, nice 19 on a shared machine: before, 850 s, of which lint-biome 447 s; after, 594 s, lint-biome 9 s. The nearest specs took 341 s and 456 s, which is load, not the change.
