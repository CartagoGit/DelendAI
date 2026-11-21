---
id: x01088
title: "The picomatch ReDoS advisory with no patched version is a dated exception, so the security gate stops refusing every pull request"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-11-17
---

# x01088 — The picomatch ReDoS advisory with no patched version is a dated exception, so the security gate stops refusing every pull request

## goal

lint:dependency-advisories (lint-security) refuses every proof and pull request since GHSA-fc5q-39xc-vjpf (picomatch <= 4.0.7, ReDoS through single-branch repeated extglobs, high) reached it on 2026-11-17: no picomatch version is patched (4.0.7 is the latest). After this fix config/delendai/advisory-exceptions.json names it with its reason and a re-check date, the way GHSA-gcqx-w48m-w2h4 (deepmerge) already is, and lint-security passes again.

## why

Observed 2026-11-17 on develop 6c4c43f6f: `delendai work deliver` for x00980 and `work publish` for x01087 both ended 'NOT PROVED, failed: lint-security' on dependency-advisories GHSA-fc5q-39xc-vjpf. `gh api /advisories/GHSA-fc5q-39xc-vjpf`: vulnerable picomatch <= 4.0.7, first_patched_version null. bun.lock holds picomatch 4.0.7 (via astro 7.4.12, @astrojs/internal-helpers, vite 8.3.8, vitest 5.0.3, tinyglobby 0.2.17, @parcel/watcher) and 2.3.2 (via micromatch 4.0.8, anymatch 3.1.3): all build, site-generation and test tooling, where every glob pattern is the repository's own, never user input. There is no version to override to, so the file's own documented remedy (an exception with a reason and an `until` date that fails the lint again when it expires) is the only change that does not weaken the gate.

## non-goals

- Replacing picomatch or its dependants.
- Any change to the advisory gate itself.

## slices

- global_gate: none

### S1 — The advisory is a dated exception with its reason
- **Status**: pending
- **Files**: `config/delendai/advisory-exceptions.json`
- **Gate**: none
- acceptance:
  - "Decision: one entry {advisory GHSA-fc5q-39xc-vjpf, package picomatch, reason naming the build, site and test tooling it reaches through and that every pattern is the repository's own, until 2026-12-01}; the existing entries are untouched"
  - "`bun run lint:dependency-advisories` exits 0 on the unit"
  - "Pre-check: `delendai work prove --only=lint-security` passes before the slice is handed over"

## acceptance

- Decision: one entry {advisory GHSA-fc5q-39xc-vjpf, package picomatch, reason naming the build, site and test tooling it reaches through and that every pattern is the repository's own, until 2026-12-01}; the existing entries are untouched
- `bun run lint:dependency-advisories` exits 0 on the unit
- Pre-check: `delendai work prove --only=lint-security` passes before the slice is handed over
