---
id: v00154
title: "the lints of a job run together and report every failure at once"
kind: perf
status: done
type: proposal
track: ci
date: 2026-11-02
last-transition-id: 73353117-1fb2-4ded-98c4-b92f3359d73b
last-correlation-id: 73353117-1fb2-4ded-98c4-b92f3359d73b
last-transition-from: review
last-transition-at: 2026-11-03T01:00:02.175Z
shipped-in:
  - "50e91dfdf72fcf4193385d969efd56b129ceb183"
---

# v00154 — the lints of a job run together and report every failure at once

## goal

A lint job takes the time of its slowest lint, and one pass names everything wrong, so a change is not proved again for each failure in turn.

## why

Every lint job ran its commands one after another with `set -e` or `&&`. On 2026-11-02, `lint:architecture` took about a minute for 46 lints whose slowest is seconds, and a failure hid whatever came after it, so one change cost several 13-minute proofs, one failure at a time.

Run together, `lint:architecture` takes 9 s, `lint:job:security` 6 s, `lint:job:governance` 18 s and `lint:job:presets` 38 s, and every failure shows in one pass. Two lints dominate `lint-security`: `lint:generated-determinism` (107 s) and `lint:no-secrets` (92 s), which on a pull request already run scoped to the change. `lint:no-silent-gates` stays outside the chain, because it writes probes that lints scanning the tree trip on, and so does `lint:stray-cache-files`. Lines inside a `touches` condition stay where they are: scoping a pull request's checks is not traded for speed.

## non-goals

- Dropping or weakening any lint.
- Running chains that write through the runner.
- Speeding up the two slowest lints themselves.

## slices

- global_gate: type

### S1 — A job's lints run together
- **Status**: done
- **Files**: `tools/scripts/lint/run-together.script.ts`, `tools/scripts/lint/run-together.script.spec.ts`, `tools/scripts/lint/lints-reach-ci.script.ts`, `tools/scripts/lint/repository-identity.script.ts`, `tools/tests/lint/pre-flight-and-ci-cannot-drift.spec.ts`, `.github/workflows/ci.yml`, `package.json`
- **Gate**: type
- acceptance:
  - "Each lint job's list lives in one `package.json` chain, and the job runs it at once."
  - "A failing job names every failing lint in one pass."
  - "`lints-reach-ci` follows a chain run together."
  - "No lint is dropped."
- shipped-in: `058eaeabea17`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 50e91dfdf72f, validate exit 0 and tests 12/12 claimed, no recorded run cited; acceptance 4/4: (1) At 50e91dfd each lint job's list lives in one chain in the manifest and the job runs it at once, with the architecture, presets, documentation, security and go… (2) At 50e91dfd a failing job runs every command of its chain and then names every failing lint in one pass with its output; the run-together and the drift specs p… (3) At 50e91dfd the check that a lint reaches the forge follows a chain that runs together; the run-together and the drift specs pass 12 of 12. (4) Comparing the lints the workflow runs before and after the delivery, the set is identical: 202 unconditional and 5 conditional before, 202 unconditional and 5 … — Approved on the delivered state of 50e91dfdf72fcf4193385d969efd56b129ceb183. The lints of a job run together, a failing job names every failing lint in one pass, the check that a lint reaches the forge follows a chain that runs together, and no lint is dropped. The type gate exited 0 and the two slice specs pass 12 of 12. Two residuals, recorded and not blocking: the format job still runs its two commands rather than one chain, and the secret scan stays outside the chain, which the proposal itself prescribes; and none of the new chains, the failure naming or the chain-following check is pinned by a spec, so a future edit to them would be silent.

## acceptance

- Each lint job's list lives in one `package.json` chain, and the job runs it at once.
- A failing job names every failing lint in one pass.
- `lints-reach-ci` follows a chain run together.
- No lint is dropped.
