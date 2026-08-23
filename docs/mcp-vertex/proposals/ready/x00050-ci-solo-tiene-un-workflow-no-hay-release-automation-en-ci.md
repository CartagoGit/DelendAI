---
id: x00050
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: CI solo tiene un workflow — no hay release automation en CI
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00050 — CI solo tiene un workflow — no hay release automation en CI

## Goal

Address the `MINOR` finding surfaced by the originating audit
(_audit reference missing_)
:

- CI solo tiene un workflow — no hay release automation en CI
- Severity band: **MINOR**
- Cited file(s): `[`

## Slices

### x00050-s1 — Fix: CI solo tiene un workflow — no hay release automation en CI

- **Status**: pending
- **Files**:
    - `[`
- **Gate**: bun run validate
- **Acceptance**:
    - The cited file(s) no longer exhibit the `MINOR` symptom
    - `bun run validate` exits 0
    - `bun run lint:proposals` exits 0

## Acceptance

- [ ] The cited file(s) no longer exhibit the symptom.
- [ ] `bun run validate` passes.
- [ ] `bun run lint:proposals` passes.

<!--
  Sourced by `audit_run`.
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00050-ci-solo-tiene-un-workflow-no-hay-release-automation-en-ci.md
-->
