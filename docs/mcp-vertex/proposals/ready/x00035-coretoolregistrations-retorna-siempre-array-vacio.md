---
id: x00035
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `coreToolRegistrations` retorna siempre array vacío
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00035 — `coreToolRegistrations` retorna siempre array vacío

## Goal

Address the `MINOR` finding surfaced by the originating audit
(_audit reference missing_)
:

- `coreToolRegistrations` retorna siempre array vacío
- Severity band: **MINOR**
- Cited file(s): `[`

## Slices

### x00035-s1 — Fix: `coreToolRegistrations` retorna siempre array vacío

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00035-coretoolregistrations-retorna-siempre-array-vacio.md
-->
