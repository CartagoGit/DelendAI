---
id: x01074
title: "Entering a unit never changes the lockfile"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-15
last-transition-id: 74bef541-5385-4637-a46b-ffee3073f895
last-correlation-id: 74bef541-5385-4637-a46b-ffee3073f895
last-transition-from: in-progress
last-transition-at: 2026-11-15T22:21:37.211Z
---

# x01074 — Entering a unit never changes the lockfile

## goal

A plain bun install in a unit worktree leaves bun.lock byte-identical, because the committed lockfile is canonical for the pinned bun version, the product gives every unit its dependencies at work enter from that frozen lockfile, and a guard refuses a commit that changes bun.lock without changing a package.json.

## why

Observed 2026-11-15 with three agents: a bare bun install in a fresh unit worktree rewrote the committed bun.lock (40 lines: 1 insertion, 39 deletions). One agent committed it by accident and another's work deliver failed on the dirty tree. Cause measured on develop e086760fc with bun 1.4.3 (packageManager and CI pin 1.4.2): bun install --frozen-lockfile reports no changes, but a non-frozen install re-resolves the lock. The committed lock keeps vite 8.3.5 at the top level plus a nested astro/vite 8.3.8 with its own vite/rolldown 1.2.15 subtree, left over from raising the astro range and from lockfile merges (the last bun.lock commits are Merge origin/develop). A fresh resolve dedupes to a single vite 8.3.8, drops the nested entries and rewrites the top-level one. So the lock is valid but not canonical: any non-frozen install changes it. work enter already installs with bun install --frozen-lockfile --ignore-scripts or links the shared modules, so the dependencies exist and nothing tells an agent not to run bare bun install. Nothing refuses a bun.lock change that has no package.json change, and the local bun is not checked against the pin.

## non-goals

- Upgrading or downgrading any dependency version.
- Changing the pinned bun version of CI.
- Replacing bun as package manager.
- Changing how the shared modules are linked when the lockfiles are equal.

## slices

- global_gate: none

### S1 — The committed lockfile is canonical for the pinned bun
- **Status**: review
- **Files**: `bun.lock`
- **Gate**: none
- acceptance:
  - "After bun install on develop with bun 1.4.2, git diff bun.lock is empty."
  - "bun install --frozen-lockfile still passes."
  - "The commit body states the dependency versions are unchanged apart from the removed duplicate vite and rolldown entries."
- shipped-in: `b2d30e6435f3`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — A guard refuses a lockfile change without a manifest change
- **Status**: review
- **Files**: `tools/scripts/lint/lockfile-follows-manifest.script.ts`, `tools/scripts/lint/lockfile-follows-manifest.script.spec.ts`, `package.json`
- **Gate**: none
- acceptance:
  - "The guard exits non-zero when a commit or the staged set changes bun.lock and no package.json, and names the paths."
  - "It exits 0 when both change or neither does."
  - "A spec proves the three cases."
  - "The guard runs in the pre-commit hook and in validate."
- shipped-in: `b3cdb9dea54f`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Entering a unit reports the exact install command and the bun mismatch
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/unit-dependencies.service.ts`, `packages/core/tests/src/lib/work-units/unit-dependencies.service.spec.ts`
- **Gate**: none
- acceptance:
  - "The enter answer states that dependencies come from the frozen lockfile and that a bare bun install must not be run."
  - "When the running bun differs from packageManager the answer says so with both versions."
  - "A spec proves the message and the mismatch case."
- shipped-in: `b2d30e6435f3`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- After bun install on develop with bun 1.4.2, git diff bun.lock is empty.
- bun install --frozen-lockfile still passes.
- The commit body states the dependency versions are unchanged apart from the removed duplicate vite and rolldown entries.
- The guard exits non-zero when a commit or the staged set changes bun.lock and no package.json, and names the paths.
- It exits 0 when both change or neither does.
- A spec proves the three cases.
- The guard runs in the pre-commit hook and in validate.
- The enter answer states that dependencies come from the frozen lockfile and that a bare bun install must not be run.
- When the running bun differs from packageManager the answer says so with both versions.
- A spec proves the message and the mismatch case.
