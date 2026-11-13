---
id: c00536
title: "qs is pinned past GHSA-6pq8-jhm2-2vcw"
kind: chore
status: done
type: proposal
track: security
date: 2026-10-27
last-transition-id: 2b748e43-dfe9-439b-8183-71d586325e30
last-correlation-id: 2b748e43-dfe9-439b-8183-71d586325e30
last-transition-from: review
last-transition-at: 2026-11-02T22:43:53.702Z
shipped-in:
  - "a0754d0a7"
---

# c00536 — qs is pinned past GHSA-6pq8-jhm2-2vcw

## goal

No package in the lockfile resolves `qs` to a version GHSA-6pq8-jhm2-2vcw affects.

## why

The advisory (moderate: `qs.stringify` with `arrayFormat: 'comma'` throws on array elements whose own `toString` is not callable) was published for `qs >=6.7.0 <=6.16.0`, patched in 6.16.1. The lockfile resolved the root `qs` to 6.16.0 (only `body-parser` had its own 6.16.1), so `lint:dependency-advisories` failed lint-security on every pull request from 2026-10-27, and `verify:security` with it.

## non-goals

- Upgrading the packages that depend on `qs`.

## slices

- global_gate: none

### S1 — The override pins the patched version
- **Status**: done
- **Files**: `package.json`, `bun.lock`
- **Gate**: none
- acceptance:
  - "package.json overrides qs to 6.16.1 and bun.lock resolves no qs below it."
  - "lint:dependency-advisories passes."
- shipped-in: `a0754d0a7`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at a0754d0a7888, validate exit 0 and tests 1/1 claimed, no recorded run cited; acceptance 2/2: (1) At a0754d0a the package manifest overrides qs to 6.16.1 and the lockfile carries exactly one qs, at 6.16.1, with the nested body-parser entry hoisted to that s… (2) Running the dependency advisories lint on the delivered lockfile reports no qs advisory at all, and the lint passes with exit 0 on the current tree, with the o… — Approved on the delivered state of a0754d0a78883e9a2cb69b89f3bba6dd30baafa9. The override pins qs at 6.16.1 and the lockfile resolves no qs below it, and the advisory the slice targets is gone from the audit. The type gate exited 0. One thing recorded so the owner sees it: at the delivery commit the advisory lint was still red for three packages this slice never touched, deepmerge, glob and minimatch, and those were excepted the following morning rather than fixed, so the lint is green today because of an exception rather than because those three are sound. The evidence recorded for this slice is the lockfile inspection and one advisory lint run.

## acceptance

- package.json overrides qs to 6.16.1 and bun.lock resolves no qs below it.
- lint:dependency-advisories passes.
