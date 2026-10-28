---
id: c00536
title: "qs is pinned past GHSA-6pq8-jhm2-2vcw"
kind: chore
status: review
type: proposal
track: security
date: 2026-10-27
last-transition-id: 4e124d04-af11-434f-8213-c19e515b6c3b
last-correlation-id: 4e124d04-af11-434f-8213-c19e515b6c3b
last-transition-from: in-progress
last-transition-at: 2026-10-28T09:30:38.575Z
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
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- package.json overrides qs to 6.16.1 and bun.lock resolves no qs below it.
- lint:dependency-advisories passes.
