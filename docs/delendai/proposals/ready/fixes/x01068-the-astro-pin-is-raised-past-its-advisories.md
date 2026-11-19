---
id: x01068
title: "The astro pin is raised past its advisories"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-13
---

# x01068 — The astro pin is raised past its advisories

## goal

The dependency-advisories gate passes again: astro moves from 7.3.8 to the 7.4.7 floor, the first release past GHSA-mh32-jxcr-mh9f and GHSA-r3h5-4585-7x3w.

## why

The dependency-advisories gate reports astro 7.3.8 against GHSA-mh32-jxcr-mh9f (low, patched in 7.4.5) and GHSA-r3h5-4585-7x3w (moderate, patched in 7.4.7). astro is a direct dependency of the root and apps/web, so every proof fails lint-security until its range moves; the first release past both is 7.4.7, still within 7.x.

## non-goals

- Adding an advisory exception: a patched release exists, so the range moves instead.
- Touching @astrojs/node: the gate does not report it.

## slices

- global_gate: none

### S1 — Raise the astro range to the first patched release
- **Status**: pending
- **Files**: `package.json`, `apps/web/package.json`, `bun.lock`
- **Gate**: none
- acceptance:
  - "The root and apps/web astro range is ~7.4.7, the first release past both advisories"
  - "bun.lock resolves astro past 7.4.7"
  - "bun tools/scripts/lint/dependency-advisories.script.ts reports no astro advisory"

## acceptance

- The root and apps/web astro range is ~7.4.7, the first release past both advisories
- bun.lock resolves astro past 7.4.7
- bun tools/scripts/lint/dependency-advisories.script.ts reports no astro advisory
