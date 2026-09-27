---
id: x00571
title: "CI is proportional to the change"
kind: fix
status: review
type: proposal
track: speed
date: 2026-09-20
tags:
    - ci
    - job-scope
shipped-in:
  - 41d928fd1
---

# x00571 — CI is proportional to the change

## goal

A change that touches no source does not compile the repository and does
not run its test suite.

## why

Every pull request in the queue reports 38 checks. Measured on one of
them — a change to `packages/core/src/public/index.ts`, a lint baseline
and a proposal — **24 of 25 jobs ran** and one skipped, for about 30
machine-minutes.

`plan-scope` already exists to prevent exactly this, and
`validate-summary` already accepts a skipped job **only** when the plan
says it was out of scope, so the mechanism is sound and cannot produce a
green tick over a gate that silently vanished. The problem is the table
it reads: 18 of 25 jobs declared `touches: 'always'`, including
`typecheck` and all three test jobs. A change touching one proposal
markdown file planned 20 of 25 jobs and ran the entire test matrix.

The reasons written next to those four entries are sound *about source
changes* — a type error does surface in the consuming file, and a
coverage verdict must not be skipped on the change that lowers it. They
simply do not apply when the change contains no source at all. Nothing
under `docs/` can move what `tsc` concludes.

## non-goals

- Narrowing the whole-repository lints. `lint-biome`, `lint-security`,
  `lint-governance` and the rest read the whole tree by design, and their
  stated reasons hold for a docs-only change too.
- Filtering *within* the test zones. They already filter to what a change
  can reach; this only answers the prior question of whether there is any
  source for a zone to reach.
- Changing the required check, or what it accepts.

## architecture

`SOURCE_PREFIXES` names every directory that can hold a `.ts` file and
every root file that can change how one compiles or runs. `typecheck`,
`plan-tests`, `tests-zone` and `tests` share it.

They share it **deliberately**: `tests` computes the coverage verdict
from what `tests-zone` produced, so if the two could disagree a change
could receive a coverage verdict over an empty scan root — a gate passing
having measured nothing. A spec pins that the three test jobs always
plan identically.

The bound stays wider than the strict inputs, per the asymmetry the file
already states: what it excludes is only what cannot reach a compiler or
a test runner — `docs/`, `.github/`, `config/`, `.vscode/` and the root
markdown.

## slices

### S1 — compiling and testing are scoped to source

- **Status**: done
- **Files**: [`tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/ci/job-scope.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5 (PR #306, merge 0ad1b304d), reviewer glm-5.3-max. Diff read: job-scope.constant.ts declares SOURCE_PREFIXES covering every workspace root plus the root files that can change compilation (package.json, bun.lock, tsconfig*, vitest.*, biome.json, delendai.config.json); typecheck, plan-tests, tests-zone and tests share it. Gate green 20/20 covering the acceptance table: docs-only plans none of the four; any source prefix plans all four; root-file touches plan all four; docs+source plans all four; the three test jobs always plan identically. The skip-fails-closed property is upheld by validate-summary per the proposal and unchanged.
- review-attribution: claude-opus-5 from commit 41d928fd127a names refs/heads/delendai/wip/claude-opus-5/x00571-S1-g1/ci-is-proportional-to-the-change (41d928fd127a686a95ed9604881ac2810c20c063), opened by glm-5.3-max
## acceptance

- A docs-only change plans 16 of 25 jobs, down from 20, and plans none of
  `typecheck`, `plan-tests`, `tests-zone`, `tests`.
- A change touching any of `packages/ plugins/ apps/ extensions/ tools/
  tests/` plans all four.
- A change touching `package.json`, `bun.lock`, any `tsconfig*`,
  `vitest.*`, `biome.json` or `delendai.config.json` plans all four.
- A docs change arriving alongside any source plans all four.
- `tests`, `tests-zone` and `plan-tests` always plan identically.

## risks and mitigations

- **A source file outside the listed prefixes.** The prefixes cover every
  workspace root in the repository; `lint:job-scope` already fails when a
  workflow job has no entry, and a spec enumerates the root files. A new
  top-level source directory would need adding here — the same as it
  would need adding to `tsconfig.json`.
- **A skipped job read as a pass.** It cannot be: `validate-summary`
  accepts a skip only when `plan-scope` published a plan that names the
  job as out of scope, and fails on a skip with no plan behind it.
