---
id: v00154
title: "the lints of a job run together and report every failure at once"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-11-02
---

# v00154 — the lints of a job run together and report every failure at once

## goal

A lint job takes the time of its slowest lint, and one pass names everything wrong, so a change is not proved again for each failure in turn.

## why

Every lint job ran its commands one after another with `set -e` or `&&`. On 2026-11-02, `lint:architecture` took about a minute for 46 lints whose slowest is seconds, and a failure hid whatever came after it, so one change cost several 13-minute proofs, one failure at a time.

Run together, `lint:architecture` takes 11 s and `lint:job:presets` 36 s, and every failure shows in one pass. Two lints dominate `lint-security`: `lint:generated-determinism` (107 s) and `lint:no-secrets` (92 s), which on a pull request already run scoped to the change. `lint:stray-cache-files` must stay alone and last: other lints leave probes in the cache.

## non-goals

- Dropping or weakening any lint.
- Running chains that write through the runner.
- Speeding up the two slowest lints themselves.

## slices

- global_gate: type

### S1 — A job's lints run together
- **Status**: pending
- **Files**: `tools/scripts/lint/run-together.script.ts`, `tools/scripts/lint/run-together.script.spec.ts`, `tools/scripts/lint/lints-reach-ci.script.ts`, `.github/workflows/ci.yml`, `package.json`
- **Gate**: type
- acceptance:
  - "Each lint job's list lives in one `package.json` chain, and the job runs it at once."
  - "A failing job names every failing lint in one pass."
  - "`lints-reach-ci` follows a chain run together."
  - "No lint is dropped."

## acceptance

- Each lint job's list lives in one `package.json` chain, and the job runs it at once.
- A failing job names every failing lint in one pass.
- `lints-reach-ci` follows a chain run together.
- No lint is dropped.
