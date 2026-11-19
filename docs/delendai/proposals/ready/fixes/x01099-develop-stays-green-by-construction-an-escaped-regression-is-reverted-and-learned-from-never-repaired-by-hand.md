---
id: x01099
title: "Develop stays green by construction: an escaped regression is reverted and learned from, never repaired by hand"
kind: fix
status: ready
type: proposal
track: workflow
date: 2026-11-19
---

# x01099 — Develop stays green by construction: an escaped regression is reverted and learned from, never repaired by hand

## goal

A change that breaks develop is detected automatically, its culprit merge is reverted as a repair through land, the work is re-opened with the failing spec names, and the miss feeds back into the touched selection and the KPIs, so the flow continues without a hand repair and the same escape cannot recur.

## why

Owner request 2026-11-19: why do we let in changes that break develop with no mechanism that detects it automatically and corrects it without breaking anything new, so the flow continues and feeds back.

Evidence (2026-11-18/19). Three regressions reached develop through PRs that were green on their selection; every later PR then failed on base failures:
- c00537 S3 (#2998): create_proposal changed. About 40 specs reach it through the authoring barrel and were not selected: nearSpecs (tools/scripts/ci/near-specs.ts) follows only direct importers by stem.
- f00823 S1 (#3056): work-deliver.service gained a static import. packages/cli/src/lib/startup-budget.spec.ts reads the import graph from disk and imports nothing, so it was not selected.
- f00800 S6 (#3016): the extension's tree views were removed. extensions/vscode/src/test/build-smoke.e2e.spec.ts builds the bundle by script and imports nothing, so it was not selected.

develop's own CI ran the full suite and went red. Nothing reacted. ci.yml:406 still assumes "develop is green by construction".

## non-goals

- Reverting anything on a green develop run.
- Repairing a regression by hand on develop.
- Weakening or skipping a spec to make develop green.

## slices

- global_gate: none

### S1 — The touched selection follows every consumer: transitive importers through barrels and re-exports, and declared readers
- **Status**: pending
- **Files**: `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`, `tools/scripts/ci/affected-specs.service.ts`, `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "near-specs.spec.ts: a change to plugins/proposals/src/lib/tools/create_proposal.tool.ts (or its successor) selects specs that reach it only through the authoring barrel, using the module graph of affected-specs.service.ts (one graph, no second resolver)."
  - "near-specs.spec.ts: a change to packages/cli/src/lib/work-deliver.service.ts selects packages/cli/src/lib/startup-budget.spec.ts, and a change to extensions/vscode/src/extension.ts selects build-smoke.e2e.spec.ts. Both are reached through zone-reads reader declarations; a spec that reads or builds sources from disk declares what it reads."
  - "The selection grows at most to what the graph reaches. Selection time stays measured, under its budget."

### S2 — A red develop run names its culprit merge
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `new:packages/core/src/lib/integration/land/develop-red.helper.ts`, `new:packages/core/tests/src/lib/integration/land/develop-red.helper.spec.ts`, `packages/core/src/lib/integration/decisions/culprit.helper.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "develop-red.helper.spec.ts, over a fake forge: given the last green develop run and a red one, the failing specs are attributed to the one merge between them whose footprint (files, zones, reader declarations) reaches them, reusing attributeCulprit. With no single owner, suspects are listed and the earliest suspect's revert is tried first."
  - "The failures of the red run are recorded as develop's known-failing set (spec ids), keyed by commit."

### S3 — land reverts the culprit merge as a repair and re-opens its work; nothing is repaired by hand
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/integration/land/land.helper.ts`, `packages/core/src/lib/integration/land/land-labels.helper.ts`, `new:packages/core/src/lib/integration/land/land-revert.helper.ts`, `new:packages/core/tests/src/lib/integration/land/land-revert.helper.spec.ts`, `packages/core/src/lib/integration/land/land-workflow.helper.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "land-revert.helper.spec.ts: on a red develop run with a culprit, land opens one revert pull request of that merge (`git revert -m 1`). It is labelled delendai:repair and admitted ahead of every other candidate. It merges only if its run turns the culprit's failures green and adds none. The original work's unit is re-opened with delendai:needs-update and the failing spec names."
  - "A pass run twice opens no second revert. A revert that would conflict is reported as needing a person, and nothing is pushed."
  - "land.yml (generated) runs this on develop's completed CI; `bun run lint:workflows` passes."

### S4 — While develop is red, only repairs enter; the proof and CI subtract base failures
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/integration/land/land-batch-assembly.helper.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `new:packages/core/tests/src/lib/work-units/work-unit-prove.service.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-unit-prove.service.spec.ts: a spec in develop's known-failing set fails the proof only if the unit touched its footprint; otherwise it is reported as base, not as the unit's failure."
  - "With develop red, land assembles only delendai:repair PRs and PRs whose failure set is a subset of the known-failing set and shrinks it. A PR adding a failure is never batched."
  - "ci.yml:406's comment and logic match: develop is green by construction because escapes are reverted, not assumed."

### S5 — The local proof runs every gate the required CI checks run, from one manifest
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-prove-only.service.ts`, `new:tools/scripts/lint/proof-covers-ci-gates.script.ts`, `new:tools/scripts/lint/proof-covers-ci-gates.script.spec.ts`, `package.json`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "proof-covers-ci-gates.script.spec.ts fails when a script that a required CI job runs (proposal-files-exist, test:budgets:check, …) has no step in the proof. Wired in package.json and a CI lint job."
  - "A baseline that a lint computes from the working tree is computed from tracked files only, so local and CI agree (proposal-files-exist counted ignored local files)."

### S6 — Every escaped regression becomes a lesson and a metric
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `plugins/self-learning/src/lib/lessons/derive-lessons.helper.ts`, `plugins/self-learning/tests/src/lib/lessons/derive-lessons.spec.ts`, `plugins/project-kpis/src/lib/services/kpi-aggregation.service.ts`, `plugins/project-kpis/tests/src/kpi-aggregation.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "derive-lessons.spec.ts: a reverted culprit records a `selection-gap` lesson (changed file → failing spec not selected), routed to S1's reader declarations or graph as a generic fix."
  - "KPIs split land-ran / merged / develop-green / release-certified, and count escaped regressions per week, with a trend toward zero."

## acceptance

- near-specs.spec.ts: a change to plugins/proposals/src/lib/tools/create_proposal.tool.ts (or its successor) selects specs that reach it only through the authoring barrel, using the module graph of affected-specs.service.ts (one graph, no second resolver).
- near-specs.spec.ts: a change to packages/cli/src/lib/work-deliver.service.ts selects packages/cli/src/lib/startup-budget.spec.ts, and a change to extensions/vscode/src/extension.ts selects build-smoke.e2e.spec.ts. Both are reached through zone-reads reader declarations; a spec that reads or builds sources from disk declares what it reads.
- The selection grows at most to what the graph reaches. Selection time stays measured, under its budget.
- develop-red.helper.spec.ts, over a fake forge: given the last green develop run and a red one, the failing specs are attributed to the one merge between them whose footprint (files, zones, reader declarations) reaches them, reusing attributeCulprit. With no single owner, suspects are listed and the earliest suspect's revert is tried first.
- The failures of the red run are recorded as develop's known-failing set (spec ids), keyed by commit.
- land-revert.helper.spec.ts: on a red develop run with a culprit, land opens one revert pull request of that merge (`git revert -m 1`). It is labelled delendai:repair and admitted ahead of every other candidate. It merges only if its run turns the culprit's failures green and adds none. The original work's unit is re-opened with delendai:needs-update and the failing spec names.
- A pass run twice opens no second revert. A revert that would conflict is reported as needing a person, and nothing is pushed.
- land.yml (generated) runs this on develop's completed CI; `bun run lint:workflows` passes.
- work-unit-prove.service.spec.ts: a spec in develop's known-failing set fails the proof only if the unit touched its footprint; otherwise it is reported as base, not as the unit's failure.
- With develop red, land assembles only delendai:repair PRs and PRs whose failure set is a subset of the known-failing set and shrinks it. A PR adding a failure is never batched.
- ci.yml:406's comment and logic match: develop is green by construction because escapes are reverted, not assumed.
- proof-covers-ci-gates.script.spec.ts fails when a script that a required CI job runs (proposal-files-exist, test:budgets:check, …) has no step in the proof. Wired in package.json and a CI lint job.
- A baseline that a lint computes from the working tree is computed from tracked files only, so local and CI agree (proposal-files-exist counted ignored local files).
- derive-lessons.spec.ts: a reverted culprit records a `selection-gap` lesson (changed file → failing spec not selected), routed to S1's reader declarations or graph as a generic fix.
- KPIs split land-ran / merged / develop-green / release-certified, and count escaped regressions per week, with a trend toward zero.
