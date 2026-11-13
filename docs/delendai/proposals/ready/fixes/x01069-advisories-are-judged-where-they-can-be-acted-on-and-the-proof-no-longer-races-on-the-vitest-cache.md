---
id: x01069
title: "Advisories are judged where they can be acted on, and the proof no longer races on the vitest cache"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-13
---

# x01069 — Advisories are judged where they can be acted on, and the proof no longer races on the vitest cache

## goal

A change that touches no dependency can no longer turn red because the outside world published an advisory, and a proof no longer fails at startup with ENOTEMPTY on the vitest cache.

## why

The lint-security job audits the whole lockfile on every proof and every pull request, so twice in one day (hono, astro) units that changed no dependency went red and every unit stayed blocked until someone bumped the dependency. Separately, a proof sometimes fails at startup with `ENOTEMPTY ... .vitest-cache` and passes unchanged on retry: vitest clears its shared module cache at startup when the dependency fingerprint changed, and two parallel static checks that each start vitest race on that clear (reproduced deterministically with two startups and an injected delay before the clear).

## non-goals

- Opening the fix pull request for an advisory: Dependabot does that.
- Changing the Dependabot configuration.
- Weakening the audit the promotion into the release branch requires.
- Retrying or ignoring the ENOTEMPTY error.

## slices

- global_gate: none

### S1 — Advisories judged where they can be acted on
- **Status**: pending
- **Files**: `tools/scripts/lint/dependency-advisories.script.ts`, `tools/scripts/lint/dependency-advisories.script.spec.ts`, `tools/scripts/lint/advisory-versions.ts`, `tools/scripts/lint/advisory-versions.spec.ts`, `tools/scripts/lint/advisory-gate-decision.ts`, `tools/scripts/lint/advisory-gate-decision.spec.ts`, `tools/scripts/lint/advisory-issue.ts`, `tools/scripts/lint/advisory-issue.spec.ts`, `tools/scripts/lint/advisory-sweep.script.ts`, `tools/scripts/lint/advisory-wiring.spec.ts`, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/tier3.yml`
- **Gate**: type
- acceptance:
  - "In a proof and in a pull request into the integration branch the advisory gate runs only when the changed files include a package.json, bun.lock or the advisory-exceptions file, and otherwise prints a line saying why it was skipped"
  - "When it runs it fails only on advisories for packages whose resolved version differs between the base and head lockfile, or whose declared range changed; every other advisory is reported as a warning naming the sweep issue"
  - "The promotion into the release branch and a push to it still run the whole-lockfile audit and fail on any advisory"
  - "A tier3 job on the integration branch (nightly and on push) opens or refreshes one labelled issue per advisory with package, installed version, first patched version and who pins it, using only the workflow's own issues: write permission"
  - "The decision (run, skip, warn, fail), the issue body and the issue key are specified by table-driven specs"

### S2 — The proof settles the vitest cache before its parallel fan-out
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/vitest-cache-settle.ts`, `tools/scripts/ci/vitest-cache-settle.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan-cache-settle.spec.ts`
- **Gate**: type
- acceptance:
  - "The proof runs one vitest startup, alone, before the parallel static checks, so the cache fingerprint is current when the parallel startups read it and none of them clears the shared directory"
  - "A failing settle step fails the proof and starts no parallel check; nothing is retried or ignored"
  - "A spec fails without the change: the first parallel check never starts before the settle step has finished"

## acceptance

- In a proof and in a pull request into the integration branch the advisory gate runs only when the changed files include a package.json, bun.lock or the advisory-exceptions file, and otherwise prints a line saying why it was skipped
- When it runs it fails only on advisories for packages whose resolved version differs between the base and head lockfile, or whose declared range changed; every other advisory is reported as a warning naming the sweep issue
- The promotion into the release branch and a push to it still run the whole-lockfile audit and fail on any advisory
- A tier3 job on the integration branch (nightly and on push) opens or refreshes one labelled issue per advisory with package, installed version, first patched version and who pins it, using only the workflow's own issues: write permission
- The decision (run, skip, warn, fail), the issue body and the issue key are specified by table-driven specs
- The proof runs one vitest startup, alone, before the parallel static checks, so the cache fingerprint is current when the parallel startups read it and none of them clears the shared directory
- A failing settle step fails the proof and starts no parallel check; nothing is retried or ignored
- A spec fails without the change: the first parallel check never starts before the settle step has finished
