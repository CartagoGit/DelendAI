---
id: x00033
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `zombie-reconcile.ts` y `promote-on-release.ts` también usan sync I/O
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00033 — `zombie-reconcile.ts` y `promote-on-release.ts` también usan sync I/O

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- `zombie-reconcile.ts` y `promote-on-release.ts` también usan sync I/O
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00033-s1 — Fix: `zombie-reconcile.ts` y `promote-on-release.ts` también usan sync I/O

- **Status**: pending
- **Files**:
    - `[`
- **Gate**: bun run validate
- **Acceptance**:
    - The cited file(s) no longer exhibit the `BAD` symptom
    - `bun run validate` exits 0
    - `bun run lint:proposals` exits 0

## Acceptance

- [ ] The cited file(s) no longer exhibit the symptom.
- [ ] `bun run validate` passes.
- [ ] `bun run lint:proposals` passes.

<!--
  Sourced by `audit_run`.
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00033-zombie-reconcile-ts-y-promote-on-release-ts-tambien-usan-syn.md
-->
