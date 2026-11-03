---
id: v00146
title: "A pull request starts only the test jobs that run, and the specs that read a change share one job"
kind: perf
status: done
type: proposal
track: ci
date: 2026-10-29
last-transition-id: dd133c18-fb00-4d9e-9ec0-f27f73cdd5c6
last-correlation-id: dd133c18-fb00-4d9e-9ec0-f27f73cdd5c6
last-transition-from: review
last-transition-at: 2026-11-02T23:17:52.424Z
shipped-in:
  - "822b2d84ec6fd185ee94970f0638e6bf0656ec14"
  - "67efd58de1f0f9327a41ba73235b5eef9972d2dd"
---

# v00146 — A pull request starts only the test jobs that run, and the specs that read a change share one job

## goal

A pull request starts a test job only for work it will do: zones the change does not reach start nothing, and the few specs that read a changed file, across every zone, run in one job.

## why

After v00143 a zone the change does not reach still started its job, which took a runner, checked out and reported `skipped`; a change read by specs in three zones started three jobs of a few specs each. Every job costs about 40 s of setup and a runner from a concurrency the account caps, so on a pull request of 38 jobs the later ones waited for a runner before they began. The jobs that did run started late and ran long: `plan-tests` waited for `typecheck` and `lint-biome` (~30 s each, in parallel), so the shards began at +68 s, and every shard instrumented the whole repository for coverage although a pull request is judged only on the files it touched — measured on one zone, 54 s with every file instrumented and 23 s with the touched one. And a green pull request waited for the queue's hourly run to be armed, because only a certification of develop woke it; a README or agent-brief edit ran every shard; and a workflow edit ran its zones unfiltered although the read map names the specs that read it. The matrix kept unreached zones on purpose, so that one missing from the list could not be mistaken for one forgotten; the planner's log now names each zone it does not start, and why.

## non-goals

- Changing which specs a change reaches (v00143).

## slices

- global_gate: type

### S1 — Only the jobs that run, readers merged
- **Status**: done
- **Files**: `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`compactMatrix` keeps the jobs that run, merges every `readers` job into one named `readers` with the union of their specs, and returns a single `none` job when nothing runs (test-zones.script.spec.ts); the planner prints each zone it does not start."
- shipped-in: `ff793d6e4a20`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 822b2d84ec6f, validate exit 0 and tests 33/33 claimed, no recorded run cited; acceptance 1/1: (1) At 822b2d84 the matrix keeps only the jobs that run, merges every readers job into one named readers holding the union of their specs, and returns a single job… — Approved on the delivered state of 822b2d84ec6fd185ee94970f0638e6bf0656ec14. The matrix keeps the jobs that run, folds the readers jobs into one, and says so when nothing runs, and the planner names each zone it does not start. The type gate exited 0 and the slice spec passes 33 of 33. One residual, recorded and not blocking: the printing is not pinned by any spec, it was verified by reading the code and by running the planner, which printed eleven lines for the zones it did not start.

### S2 — The tests plan without waiting for the type and format checks
- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "`plan-tests` declares no `needs`, so the test shards start beside `typecheck` and `lint-biome`, and `delendai-validate` still requires both."
- shipped-in: `77f910e98f4e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 67efd58de1f0, validate exit 0 and tests 1/1 claimed, no recorded run cited; acceptance 1/1: (1) At 67efd58 the workflow's plan-tests job declares no needs, so the test shards start beside the type and format checks, while the validation job still requires… — Approved on the delivered state of 67efd58de1f0f9327a41ba73235b5eef9972d2dd. The test shards start beside the type and format checks instead of waiting for them, and the validation job still requires all three. The type gate exited 0. One check was recorded for this slice and it is a state check, not a test suite: the delivered workflow was parsed with the repository's own workflow reader, which reports that plan-tests needs nothing and that the validation job needs the plan, the typecheck and the format check. One residual, recorded and not blocking: no spec asserts the job graph, so a future change to the workflow would be silent.

### S3 — A pull request instruments only the files it touched
- **Status**: done
- **Files**: `vitest.config.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "On a pull request the shards and the merge set `VITEST_COVERAGE_FILES` to the files changed since the base, and `vitest.config.ts` narrows `coverage.include` to those of them its globs already select (a file outside them stays unmeasured, and none touched measures nothing), so the changed-file coverage verdict is the one the full selection gives."
- shipped-in: `77f910e98f4e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 67efd58de1f0, validate exit 0 and tests 1/1 claimed, no recorded run cited; acceptance 1/1: (1) At 67efd58 the shard step and the merge step set the coverage file list from the files changed since the base on a pull request, and the vitest configuration n… — Approved on the delivered state of 67efd58de1f0f9327a41ba73235b5eef9972d2dd. A pull request instruments only the files it touched, and the coverage selection is narrowed to the intersection with its own globs, so a file outside them stays unmeasured and a change that touches nothing measures nothing. The type gate exited 0. One check was recorded for this slice and it is a state check, not a test suite: the delivered workflow and the delivered vitest configuration were read. One residual, recorded and not blocking: no spec pins either the narrowing or the empty case, so a future change would be silent.

### S4 — A publication that goes green wakes the queue
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/forge/certify-integration.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A publication whose `delendai-validate` goes green dispatches the queue (`wake-the-queue` in ci.yml, under `!cancelled()` so the jobs a pull request scopes out do not skip it, own `delendai/pr/` branches only; certify-integration.script.spec.ts), so it is armed within minutes with every other green candidate instead of at the next hourly run."
- shipped-in: `15f8c5aaa2c0`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 67efd58de1f0, validate exit 0 and tests 17/17 claimed, no recorded run cited; acceptance 1/1: (1) At 67efd58 the workflow has a job that wakes the queue once the validation job is green, under a condition that is not cancelled, that the publication's own br… — Approved on the delivered state of 67efd58de1f0f9327a41ba73235b5eef9972d2dd. A publication whose validation goes green wakes the queue within minutes, on its own branches only, and the condition is not cancelled, so the jobs a pull request scopes out do not skip it. The type gate exited 0 and the slice spec passes 17 of 17. One residual, recorded and not blocking: the condition asks for a pull request event, so a publication branch pushed without a pull request does not wake the queue.

### S5 — Prose reaches its readers, and readers run beside a changed zone
- **Status**: done
- **Files**: `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.interface.ts`, `tools/scripts/ci/test-zones.script.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "A changed root `*.md`, `LICENSE`, `.mailmap` or `.github/` file outside workflows and actions reaches only the specs that read it, while configuration (`delendai.config.json`, `package.json`, the lockfile, `tsconfig`, the vitest configs) still runs every zone (zone-reads.spec.ts); in a zone its code reaches too, the specs that read the root file run in the shared readers job (test-zones.script.spec.ts), so the shard step no longer runs a zone unfiltered because a workflow or `.yml` changed."
- shipped-in: `15f8c5aaa2c0`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 67efd58de1f0, validate exit 0 and tests 22/22 claimed, no recorded run cited; acceptance 1/1: (1) At 67efd58 a changed root prose file, licence, mailmap or a github file outside the workflows and the actions reaches only the zones that read it, while the co… — Approved on the delivered state of 67efd58de1f0f9327a41ba73235b5eef9972d2dd. A prose change reaches only the specs that read it, the configuration files still run every zone, and the readers of a root file in a zone whose code is reached too run in the shared readers job, so a workflow change no longer runs a zone unfiltered. The type gate exited 0 and the slice spec passes 22 of 22. No defect found.

## acceptance

- `compactMatrix` keeps the jobs that run, merges every `readers` job into one named `readers` with the union of their specs, and returns a single `none` job when nothing runs (test-zones.script.spec.ts); the planner prints each zone it does not start.
- `plan-tests` declares no `needs`, so the test shards start beside `typecheck` and `lint-biome`, and `delendai-validate` still requires both.
- On a pull request the shards and the merge set `VITEST_COVERAGE_FILES` to the files changed since the base, and `vitest.config.ts` narrows `coverage.include` to those of them its globs already select (a file outside them stays unmeasured, and none touched measures nothing), so the changed-file coverage verdict is the one the full selection gives.
- A publication whose `delendai-validate` goes green dispatches the queue (`wake-the-queue` in ci.yml, under `!cancelled()` so the jobs a pull request scopes out do not skip it, own `delendai/pr/` branches only; certify-integration.script.spec.ts), so it is armed within minutes with every other green candidate instead of at the next hourly run.
- A changed root `*.md`, `LICENSE`, `.mailmap` or `.github/` file outside workflows and actions reaches only the specs that read it, while configuration (`delendai.config.json`, `package.json`, the lockfile, `tsconfig`, the vitest configs) still runs every zone (zone-reads.spec.ts); in a zone its code reaches too, the specs that read the root file run in the shared readers job (test-zones.script.spec.ts), so the shard step no longer runs a zone unfiltered because a workflow or `.yml` changed.
