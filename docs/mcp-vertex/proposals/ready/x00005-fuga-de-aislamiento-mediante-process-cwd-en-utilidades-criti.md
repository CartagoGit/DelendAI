---
id: x00005
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: Fuga de aislamiento mediante `process.cwd()` en utilidades críticas
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00005 — Fuga de aislamiento mediante `process.cwd()` en utilidades críticas

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- Fuga de aislamiento mediante `process.cwd()` en utilidades críticas
- Severity band: **FATAL**
- Cited file(s): `:`

## Slices

### x00005-s1 — Fix: Fuga de aislamiento mediante `process.cwd()` en utilidades críticas

- **Status**: pending
- **Files**:
    - `:`
- **Gate**: bun run validate
- **Acceptance**:
    - The cited file(s) no longer exhibit the `FATAL` symptom
    - `bun run validate` exits 0
    - `bun run lint:proposals` exits 0

## Acceptance

- [ ] The cited file(s) no longer exhibit the symptom.
- [ ] `bun run validate` passes.
- [ ] `bun run lint:proposals` passes.

<!--
  Sourced by `audit_run`.
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00005-fuga-de-aislamiento-mediante-process-cwd-en-utilidades-criti.md
-->
