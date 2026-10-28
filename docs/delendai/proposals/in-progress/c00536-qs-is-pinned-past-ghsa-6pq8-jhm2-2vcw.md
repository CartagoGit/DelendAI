---
id: c00536
title: "qs is pinned past GHSA-6pq8-jhm2-2vcw"
kind: chore
status: in-progress
type: proposal
track: security
date: 2026-10-27
last-transition-id: 90e42022-9da5-46ae-b2bf-b08e8e38d702
last-correlation-id: 90e42022-9da5-46ae-b2bf-b08e8e38d702
last-transition-from: ready
last-transition-at: 2026-10-28T09:22:01.024Z
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
- **Status**: pending
- **Files**: `package.json`, `bun.lock`
- **Gate**: none
- acceptance:
  - "package.json overrides qs to 6.16.1 and bun.lock resolves no qs below it."
  - "lint:dependency-advisories passes."

## acceptance

- package.json overrides qs to 6.16.1 and bun.lock resolves no qs below it.
- lint:dependency-advisories passes.
