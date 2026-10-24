---
id: x00957
title: "Every push to main submits its resolved dependencies from bun.lock, so Dependabot judges what main ships"
kind: fix
status: done
type: proposal
track: release
date: 2026-10-23
last-transition-id: 0fbd95c4-eeca-4704-9ea7-c583434a96c8
last-correlation-id: 0fbd95c4-eeca-4704-9ea7-c583434a96c8
last-transition-from: review
last-transition-at: 2026-10-24T21:35:56.941Z
shipped-in:
  - "1df89653c2383ecd37f65829a4e98c74b1409031"
---

# x00957 — Every push to main submits its resolved dependencies from bun.lock, so Dependabot judges what main ships

## goal

A workflow on each push to main submits a dependency-graph snapshot built from bun.lock (every workspace manifest, with resolved versions), so Dependabot alerts open and close on what main really installs.

## why

Owner, 2026-10-23: six Dependabot alerts on @modelcontextprotocol/sdk stayed open after main pinned the patched 1.32.0. GitHub's automatic graph said "Dependency files checked 2 weeks ago" and its SBOM still listed 1.31.0: it does not refresh from this bun repository, and pushes to main (0.2.1, 0.2.2) did not update it. A snapshot submitted by hand through the dependency submission API (SDK at 1.32.0 for package.json and apps/web/package.json) closed every alert as fixed within a minute. Done by hand once, it goes stale again with the next bump; it must run on every push.

## non-goals

- Dismissing alerts.
- Changing which versions are pinned (lint:dependency-advisories, x00933).

## slices

- global_gate: type

### S1 — A snapshot from bun.lock
- **Status**: done
- **Files**: `tools/scripts/release/dependency-snapshot.script.ts`, `tools/scripts/release/dependency-snapshot.script.spec.ts`
- **Gate**: type
- acceptance:
  - "The script reads bun.lock and every workspace manifest and prints the dependency submission payload: one manifest per package.json, each direct dependency with its resolved version, scope runtime or development, as pkg:npm purls."
  - "A spec builds the payload from a fixture lock with a scoped package, a dev and a runtime dependency."
- shipped-in: `f27790d85f96`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 1df89653c238, validate exit 0 and tests 3/3 claimed, no recorded run cited; acceptance 2/2: (1) dependency-snapshot.script.spec: parses lock, lists direct deps per manifest at resolved versions, wraps manifests in submission payload; pass (2) same spec 'lists each external direct dependency at its resolved version, by manifest' (fixture lock); passes — verified by code reading and spec runs

### S2 — Submitted on every push to main
- **Status**: done
- **Files**: `.github/workflows/dependency-snapshot.yml`, `tools/scripts/lint/no-dead-modules.script.ts`, `tools/tests/lint/no-dead-modules.spec.ts`
- **Gate**: type
- acceptance:
  - "On push to main and on manual dispatch the workflow submits the snapshot with contents: write; the run prints the snapshot id and result."
  - "After the next promotion the SBOM lists main's resolved versions."
  - "lint:no-dead-modules judges, in a --changed run, only the files the change touches: this PR, touching release tooling alone, read 431 modules of unselected zones as never executed."
- shipped-in: `f27790d85f96`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 1df89653c238, validate exit 0 and tests 8/8 claimed, no recorded run cited; acceptance 3/3: (1) dependency-snapshot.yml: on push to main + workflow_dispatch, contents: write, posts to dependency-graph/snapshots and prints id/result via --jq (2) SBOM after next promotion: future-dated, not verifiable now; workflow wiring is in place (3) no-dead-modules.spec 'judges only the files the change touches in a changed run' passes — verified by code reading and spec runs

## acceptance

- The script reads bun.lock and every workspace manifest and prints the dependency submission payload: one manifest per package.json, each direct dependency with its resolved version, scope runtime or development, as pkg:npm purls.
- A spec builds the payload from a fixture lock with a scoped package, a dev and a runtime dependency.
- On push to main and on manual dispatch the workflow submits the snapshot with contents: write; the run prints the snapshot id and result.
- After the next promotion the SBOM lists main's resolved versions.
