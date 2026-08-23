---
id: x00016
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: Inconsistencia en el schema de `ILockEntry` — dos formatos en producción
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00016 — Inconsistencia en el schema de `ILockEntry` — dos formatos en producción

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- Inconsistencia en el schema de `ILockEntry` — dos formatos en producción
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00016-s1 — Fix: Inconsistencia en el schema de `ILockEntry` — dos formatos en producción

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00016-inconsistencia-en-el-schema-de-ilockentry-dos-formatos-en-pr.md
-->
