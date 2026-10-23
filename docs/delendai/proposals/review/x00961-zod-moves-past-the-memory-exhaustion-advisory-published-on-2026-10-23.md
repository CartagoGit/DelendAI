---
id: x00961
title: "zod moves past the memory-exhaustion advisory published on 2026-10-23"
kind: fix
status: review
type: proposal
track: dependencies
date: 2026-10-23
last-transition-id: 68e5947a-105e-4a07-8759-269592b124e9
last-correlation-id: 68e5947a-105e-4a07-8759-269592b124e9
last-transition-from: in-progress
last-transition-at: 2026-10-23T21:34:25.676Z
---

# x00961 — zod moves past the memory-exhaustion advisory published on 2026-10-23

## goal

Every manifest's zod range starts at 4.6.6 or later and the lockfile resolves a version that clears GHSA-mrhx-c7xc-m3w5, so lint:dependency-advisories passes again on every pull request.

## why

GHSA-mrhx-c7xc-m3w5 (high): zod can exhaust memory while validating oversized constrained collections; it clears at 4.6.6. The 0.2.3 forward sync (#1432) failed lint-security on it: the lockfile resolves zod 4.5.4 and 68 manifests declare ^4.4.3, whose floor admits the vulnerable versions. Every pull request runs the same lint, so the integration branch is blocked until the floor and the lock move.

## non-goals

- Other dependency updates.

## slices

- global_gate: type

### S1 — Floors and lock
- **Status**: review
- **Files**: `bun.lock`, `package.json`, `docs/delendai/DEPENDENCY-VERSIONS.md`
- **Gate**: type
- acceptance:
  - "Every package.json declares zod ^4.6.6 (or the current latest floor), the lockfile resolves a clearing version, `bun install --frozen-lockfile` reports no changes, and lint:dependency-advisories passes."
  - "The full core, tools and plugin suites pass on the new zod."
- shipped-in: `951a735e2e7d`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Every package.json declares zod ^4.6.6 (or the current latest floor), the lockfile resolves a clearing version, `bun install --frozen-lockfile` reports no changes, and lint:dependency-advisories passes.
- The full core, tools and plugin suites pass on the new zod.
