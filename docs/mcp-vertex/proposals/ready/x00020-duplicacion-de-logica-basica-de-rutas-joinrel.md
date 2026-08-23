---
id: x00020
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: Duplicación de lógica básica de rutas (`joinRel`)
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00020 — Duplicación de lógica básica de rutas (`joinRel`)

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- Duplicación de lógica básica de rutas (`joinRel`)
- Severity band: **BAD**
- Cited file(s): `:`

## Slices

### x00020-s1 — Fix: Duplicación de lógica básica de rutas (`joinRel`)

- **Status**: pending
- **Files**:
    - `:`
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00020-duplicacion-de-logica-basica-de-rutas-joinrel.md
-->
