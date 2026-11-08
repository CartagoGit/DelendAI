---
id: q00045
title: "Plan: pull requests are few and fast"
kind: plan
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-04
last-transition-id: a4f2a334-3ab0-4bd6-9d95-d14fbc09dc49
last-correlation-id: a4f2a334-3ab0-4bd6-9d95-d14fbc09dc49
last-transition-from: ready
last-transition-at: 2026-11-04T16:03:09.591Z
---

# q00045 — Plan: pull requests are few and fast

## goal

A pull request carries a meaningful batch of work, its CI runs exactly what its local proof ran, every spec is near-instant, and a typical pull request is certified in minutes, in every project that uses delendai.

## why

The owner asked on 2026-11-04 why pull requests take so long, why specs take hundreds of milliseconds or seconds, why so much is skipped, why pull requests fail tests their local proof should have caught, and why there are so many pull requests. Measured on develop's last green full run (41847292705):

- **Where test time goes.** 2,406 spec files and 18,643 tests. Test time is 1,039 s in all; 175 files (7%) take 83% of it. The 41 files over 5 s take 54%: `guard.command.spec.ts` 114 s, `proposals.real-server.spec.ts` 68 s, `work-unit.service.spec.ts` 28 s, `token-budget-dashboard.spec.ts` 20 s, and others. The other 2,231 files average 79 ms. A few real-git, real-server and real-time specs are the cost, not the count.
- **What is skipped.** Only 7 tests are skipped. What looks skipped on a pull request is whole jobs that the job scope leaves out because the change does not touch their zone. That is correct, but the run does not say so.
- **Why a pull request is red on a test its proof passed.** The local proof runs the tests of what was touched (testing.scope, f00805), while the pull request's CI still runs the zones the change reaches. The two sets differ, so CI finds what the proof never ran.
- **What a full run costs.** 43 jobs and 3,854 runner seconds. Each test shard takes 3 to 3.5 minutes, much of it checkout and install.
- **Why there are so many pull requests.** Grouping exists only within a proposal (at most 3 slices and 400 lines make one pull request). Across proposals nothing groups, so on 2026-11-04 sixteen docs-only proposal creations opened sixteen pull requests.

This follows the product principles (bootstrap section 0): efficient, fast and the same in every project.

## non-goals

- Dropping coverage: the wider reach still runs, on the promotion's full run (S7).
- Replacing vitest: measured on 2026-11-04 against bun test (x01019), and kept.

## slices

- global_gate: none

### S1 — Every spec is near-instant
- **Status**: pending
- **Files**: `tools/scripts/ci/spec-duration-budget.script.ts`
- **Gate**: none
- acceptance:
  - "No spec file outside the declared e2e tier takes over 1 s in CI; the 41 files measured over 5 s on 2026-11-04 are rewritten with in-memory fakes or moved to the e2e tier; a lint reads CI durations and reports any file over 1 s and fails any over 5 s that is not tagged e2e."

### S2 — A pull request runs what its proof ran
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`
- **Gate**: none
- acceptance:
  - "A pull request runs the tests testing.scope selects, the same set as the local proof, so a pull request is never red on a test the proof did not run; the wider reach runs on the promotion's full run (S7), and a failure there opens an urgent repair for the commit range it promotes."

### S3 — Few jobs, each worth its setup
- **Status**: pending
- **Files**: `tools/scripts/ci/test-zones.script.ts`
- **Gate**: none
- acceptance:
  - "The number of test jobs follows the selected work: a small selection runs in one job; dependencies and builds are restored from cache; a typical pull request finishes in under 5 minutes wall and 10 runner-minutes."

### S4 — Small work ships together
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/publication-grouping.service.ts`
- **Gate**: none
- acceptance:
  - "The publisher groups small publications into one pull request by what they change: docs-only proposal work, and fixes under the size limit in disjoint zones, across proposals; slices of one proposal keep the existing size rule; the grouping is decided from the diff, never by hand."

### S5 — Every skip says why
- **Status**: pending
- **Files**: `tools/scripts/ci/job-scope.script.ts`
- **Gate**: none
- acceptance:
  - "Each skipped job names the reason (zone untouched, platform) in the run summary, and an unconditional test skip fails a lint unless it carries a reason and an owner."

### S6 — A batch of independent pull requests is certified once
- **Status**: pending
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.interface.ts`, `tools/scripts/forge/queue-order.spec.ts`, `tools/scripts/git/hydration-lock.ts`, `tools/scripts/git/hydration-lock.spec.ts`, `tools/scripts/git/hydrate-candidates-after-merge.script.ts`, `tools/scripts/git/hydrate-candidates-after-merge.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Pull requests that do not overlap each other or what the integration branch gained since they left are assembled into one train: the integration branch plus all of them. One sectioned run of the union of their scopes proves the train (S7), and when it is green all of them land together. A red train is split in half until the culprit is isolated, so N independent pull requests cost one or two sectioned runs, not N runs in series. The integration branch never receives a combination that was not proved."

### S7 — Sections land, the promotion runs everything
- **Status**: pending
- **Files**: `tools/scripts/ci/test-infrastructure.ts`, `tools/scripts/ci/test-infrastructure.spec.ts`, `tools/scripts/ci/affected-specs.service.ts`, `tools/scripts/ci/affected-specs.interface.ts`, `tools/scripts/ci/test-scope.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.interface.ts`, `tools/scripts/forge/queue-order.spec.ts`, `tools/scripts/forge/queue-arming.ts`, `tools/scripts/forge/queue-arming.spec.ts`, `tools/scripts/forge/section-health.ts`, `tools/scripts/forge/section-health.spec.ts`, `.github/workflows/keep-the-queue-moving.yml`, `tools/scripts/forge/certify-integration.script.ts`, `tools/scripts/forge/certify-integration.script.spec.ts`, `tools/scripts/forge/certify-integration.interface.ts`, `tools/scripts/ci/ci-static-steps.ts`, `tools/scripts/ci/test-zones.script.spec.ts`, `tools/scripts/ci/tier-trigger.spec.ts`, `tools/scripts/forge/advance-queue.script.ts`, `tools/scripts/forge/advance-queue.script.spec.ts`, `tools/scripts/git/hydrate-candidates-after-merge.script.ts`, `tools/scripts/git/hydrate-candidates-after-merge.script.spec.ts`, `.github/workflows/ci.yml`, `tools/scripts/forge/open-promotion.script.ts`, `tools/scripts/forge/open-promotion.script.spec.ts`, `tools/scripts/governance/promotion-workflow.lib.ts`, `tools/scripts/governance/promotion-workflow.lib.spec.ts`, `.github/workflows/open-promotion.yml`
- **Gate**: type
- acceptance:
  - "A pull request, or a train of pull requests landing together, runs only the tests, lints and types of the sections it touches, once for the group: the union of its members' scopes, and that is enough to land in the integration branch. The full suite runs only on the promotion into the release branch; a failure there blocks the promotion and opens an urgent repair naming the commit range, without stopping the integration branch's queue. A lone pull request runs its own sectioned checks and rides no train of one. A change to shared test infrastructure (the vitest configs, the setup files, `vitest.shared.ts`, `@delendai/test-kit`, the tsconfig paths) selects every spec it reaches."
  - "A train runs only the union of its members' scopes: it is dispatched with the integration tip as its base, and the run plans its jobs and tests with the same job scope and test scope as a pull request."
  - "The queue arms after a green sectioned run with no full certification: no full run of the integration branch gates arming, and none is dispatched after a merge."
  - "The promotion runs everything and opens a repair on red: its run has no base, and a red required check files one urgent repair for the release range at that head."
  - "A change to the test setup selects every spec it reaches: a root vitest config, a setup file or anything a setup file imports, and a root tsconfig select every spec; a workspace's vitest config or tsconfig selects that workspace's specs; a `@delendai/test-kit` source selects the specs its symbols reach, in the touched scope too."
  - "The integration branch is healthy per section: measured 2026-11-02 to 2026-11-08 it was red 81 of 141 hours in 16 episodes, one of 66 hours, and every red run held the whole queue for a failure in one zone. The repair names the zones the full run found red; a red zone holds only the candidates whose scope reaches it, and its repair (a candidate whose own run of that zone passed) lands; every other candidate and train keeps landing, and the zone clears once a landed pull request ran it green."
  - "A failing shard is reported once, by its own `tests: <zone>` job: the `tests` merge job reports no missing blob and no coverage shortfall for it."

## acceptance

- No spec file outside the declared e2e tier takes over 1 s in CI; the 41 files measured over 5 s on 2026-11-04 are rewritten with in-memory fakes or moved to the e2e tier; a lint reads CI durations and reports any file over 1 s and fails any over 5 s that is not tagged e2e.
- A pull request runs the tests testing.scope selects, the same set as the local proof, so a pull request is never red on a test the proof did not run; the wider reach runs on the promotion's full run (S7), and a failure there opens an urgent repair for the commit range it promotes.
- The number of test jobs follows the selected work: a small selection runs in one job; dependencies and builds are restored from cache; a typical pull request finishes in under 5 minutes wall and 10 runner-minutes.
- The publisher groups small publications into one pull request by what they change: docs-only proposal work, and fixes under the size limit in disjoint zones, across proposals; slices of one proposal keep the existing size rule; the grouping is decided from the diff, never by hand.
- Each skipped job names the reason (zone untouched, platform) in the run summary, and an unconditional test skip fails a lint unless it carries a reason and an owner.
- Pull requests that do not overlap each other or what the integration branch gained since they left are assembled into one train: the integration branch plus all of them. One sectioned run of the union of their scopes proves the train (S7), and when it is green all of them land together. A red train is split in half until the culprit is isolated, so N independent pull requests cost one or two sectioned runs, not N runs in series. The integration branch never receives a combination that was not proved.
- A pull request, or a train of pull requests landing together, runs only the tests, lints and types of the sections it touches, once for the group: the union of its members' scopes, and that is enough to land in the integration branch. The full suite runs only on the promotion into the release branch; a failure there blocks the promotion and opens an urgent repair naming the commit range, without stopping the integration branch's queue. A lone pull request runs its own sectioned checks and rides no train of one. A change to shared test infrastructure (the vitest configs, the setup files, `vitest.shared.ts`, `@delendai/test-kit`, the tsconfig paths) selects every spec it reaches.
