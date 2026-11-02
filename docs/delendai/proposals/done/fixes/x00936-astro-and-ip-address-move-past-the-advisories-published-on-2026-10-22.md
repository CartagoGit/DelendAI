---
id: x00936
title: "astro and ip-address move past the advisories published on 2026-10-22"
kind: fix
status: done
type: proposal
track: security
date: 2026-10-23
last-transition-id: 79a69c2a-9726-4c73-9084-0198362dc1eb
last-correlation-id: 79a69c2a-9726-4c73-9084-0198362dc1eb
last-transition-from: review
last-transition-at: 2026-10-23T15:41:43.842Z
shipped-in:
  - "ebb3e464b2e45beb5d5b37f78709f36638219ad4"
---

# x00936 — astro and ip-address move past the advisories published on 2026-10-22

## goal

The lockfile resolves astro 7.3.8 and ip-address 10.7.4, so `lint:dependency-advisories` is green again on develop and the forward-sync of 0.2.0 into develop can land.

## why

Overnight three advisories were published against versions the lockfile resolves: astro 7.3.1 (GHSA-98hj-9722-w3j8 moderate, `<7.3.2`; GHSA-mpr7-6m5w-76rw low, `>=7.1.0 <=7.3.2`) and ip-address 10.7.3, pinned by the root `overrides` (GHSA-rxp7-6hxx-x8q5 moderate, `<=10.7.3`). `lint:dependency-advisories`, which blocks every severity, now fails on develop and on the forward-sync pull request #1370 that carries main's 0.2.0 merge back. astro 7.3.8 (2026-10-08) is the last 7.3 patch and clears both astro advisories; ip-address 10.7.4 (2026-10-11) clears its one.

## non-goals

- Moving astro to 7.4: a minor of the site generator is its own change.

## slices

- global_gate: type

### S1 — The two versions are raised
- **Status**: done
- **Files**: `package.json`, `apps/web/package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "The root and `apps/web` declare astro `~7.3.8` (a caret resolved 7.4.2), the root `overrides` pin ip-address `10.7.4`, and `bun.lock` resolves exactly those; `lint:dependency-advisories` passes with no new exception."
  - "The web site still builds (`bun run --cwd apps/web build:strict` or the CI `web site build` job) and the root suite stays green."
- shipped-in: `b7c9d753bbd4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ebb3e464b2e4, validate exit 0, tests 17368/17368; acceptance 2/2: (1) The root and `apps/web` declare astro `~7.3.8` (a caret resolved 7.4.2), the root `overrides` pin ip-address `10.7.4`, and `bun.lock` resolves exactly those; `… (2) The web site still builds (`bun run --cwd apps/web build:strict` or the CI `web site build` job) and the root suite stays green. => `bun run --cwd apps/web bui… — Read the delivering commit, the root and web manifests and bun.lock. The dependency advisory lint, the strict web build and the whole root suite were run in the review worktree: the lint exited 0 with 0 exceptions, the build finished in 5.064s exit 0, and the suite reported 2168 files / 17368 tests passed, exit 0.

## acceptance

- The root and `apps/web` declare astro `~7.3.8` (a caret resolved 7.4.2), the root `overrides` pin ip-address `10.7.4`, and `bun.lock` resolves exactly those; `lint:dependency-advisories` passes with no new exception.
- The web site still builds (`bun run --cwd apps/web build:strict` or the CI `web site build` job) and the root suite stays green.
