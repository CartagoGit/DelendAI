---
id: x01075
title: "Static checks run side by side"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-15
last-transition-id: bbe1d511-ce3d-4be3-8582-f6572bdd44b6
last-correlation-id: bbe1d511-ce3d-4be3-8582-f6572bdd44b6
last-transition-from: in-progress
last-transition-at: 2026-11-15T22:43:41.442Z
shipped-in:
  - "54ea53d9c5b76ee1403cff83b57fa204272bead6"
---

# x01075 — Static checks run side by side

## goal

The `static-checks` job of `ci.yml` is split into three jobs that run at once, balanced by measured time, so the critical path of every pull request drops from about 2m11s to about 1m. No check is removed or made conditional, `delendai-validate` still gates on all of them, and the local `prove` and the land rehearsal still read one step list.

## why

A proposal-only pull request (PR #2162, run 43740101446) takes about 3m04s of CI. `static-checks` is the longest job at 2m11s and every pull request waits for it. Its steps, measured:

| Step | Proposal-only run | Code run (#2172, run 43741989666) |
| --- | --- | --- |
| Set up job + checkout | 5 s | 4 s |
| Setup repo (bun + install) | 28 s | 19 s |
| biome + manifests | not run | 2 s |
| architecture lints | 13 s | 10 s |
| docs, content and web lints | 18 s | 16 s |
| proposal registry cache | 3 s | 2 s |
| presets and release surface | 8 s | 6 s |
| security and hygiene | 8 s | 23 s |
| governance and proposals | 13 s | 11 s |
| generated artifacts in sync | 25 s | 22 s |
| post steps | 4 s | 3 s |

The step work is about 85 s, serial, on top of about 30 s of setup.

Why not run the groups concurrently in the one job: each group already runs its lints through `run-together`, with as many workers as the runner has cores (4). The groups are CPU bound, so running them side by side on the same 4 cores gains little and makes each slower; the serial tails (`check:generated`, the security tail after its chain) are the only slack. Three runners give three times the cores for the price of two more setups.

Chosen design, three jobs balanced by the measured step times:

- `static-checks-a`: biome, manifests, architecture, docs (about 30 s of work).
- `static-checks-b`: proposal registry cache, presets, security (about 31 s).
- `static-checks-c`: governance, generated artifacts (about 36 s).

Expected wall clock: setup 25-30 s plus the longest group 36 s, about 1m05s, against 2m11s: about 65 s saved on every pull request. The cost is two extra setups, about 1 minute of runner time per run, paid back in wall clock. The next longest job then sets the pull request's time; the proposal-only 3m04s should fall by whatever `static-checks` was ahead of it.

How the constraints hold:

- `ci-static-steps.ts` already finds a check's steps in any job by the plan entry that gates them (`stepsOf`), so moving steps between jobs leaves `STATIC_CHECK_JOBS`, the local `prove` and the land rehearsal reading the same list from `ci.yml`. That is the single source and it is not copied.
- `delendai-validate` lists the three jobs in `needs`, and `job-scope.constant.ts` declares the three jobs, each with the union of the scopes of its checks, so the plan still skips a job only when every check in it is skipped.
- Each job keeps the `if: !cancelled() && plan[...]` gating of its steps, and `GH_TOKEN` stays the job's read token already in use; no job gets a write token.

## non-goals

- Dropping, reordering for speed or making conditional any lint.
- Speeding up an individual lint or the install (a separate measurement).
- Changing what the other CI jobs do.
- Running the groups concurrently inside one job (rejected above, CPU bound).

## slices

- global_gate: none

### S1 — Split static-checks into three jobs
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: none
- acceptance:
  - "`ci.yml` has `static-checks-a`, `static-checks-b` and `static-checks-c`, with every step of the old job in exactly one of them and none dropped."
  - "`delendai-validate` lists the three jobs in `needs`; `job-scope.constant.ts` declares them and the plan spec passes."
  - "`staticChecksOf` returns the same checks, with the same scripts, as before the split."
  - "No job uses `github.token` beyond the read use it already had."
- shipped-in: `8f553abaf27d`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by mai-code-2 — The three-job behavior is delivered, but one explicit acceptance identifier is wrong. Acceptance and the chosen design require jobs `static-checks-a`, `static-checks-b`, and `static-checks-c`; the delivered workflow, scope table, and test expect `static-checks`, `static-checks-b`, `static-checks-c`. Reproduce by inspecting ci.yml and the assertion in ci-static-steps.spec.ts, which both name `static-checks` as the first group; the PR timing evidence otherwise shows concurrency. To approve, either rename the first job to `static-checks-a` everywhere (workflow, JOB_SCOPES, aggregate needs, specs) or revise the proposal acceptance/design in the same unit to name the canonical preserved `static-checks` job; the code and acceptance must agree exactly.

### S2 — Prove the wall clock
- **Status**: done
- **Files**: `tools/scripts/ci/ci-static-steps.spec.ts`
- **Gate**: none
- acceptance:
  - "A spec asserts that every plan entry of `STATIC_CHECK_JOBS` gates a step in exactly one static job."
  - "The CI run of this slice's pull request shows the longest static job under 70 s of steps and the three running at once."
- shipped-in: `4da0a548e36b`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 54ea53d9c5b7, validate exit 0 and tests 66/66 claimed, no recorded run cited; acceptance 2/2: (1) ci-static-steps.spec.ts parses ci.yml and for every grouped member computes all jobs with that plan-entry if, requiring one holder equal to its declared group;… (2) Run 43771032391 for PR #2232 started static-checks, static-checks-b and static-checks-c at 22:45:57 concurrently. Their non-trivial step work was about 48s, 40… — Reviewed the spec and the delivery PR's real CI run 43771032391. All 66 focused CI-scope/static-step specs and workflow parsing pass; the three jobs started at the same second and each completed successfully with the longest work group under 70 seconds of steps.

## acceptance

- A pull request's longest static job is about half of the 2m11s of `static-checks`, with every check still run.
- `delendai-validate` is red when any of the three jobs is red.
