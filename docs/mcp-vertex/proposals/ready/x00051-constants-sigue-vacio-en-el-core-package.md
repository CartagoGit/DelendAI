---
id: x00051
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `constants/` sigue vacío en el core package
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00051 — `constants/` sigue vacío en el core package

## Goal

Address the `MINOR` finding surfaced by the originating audit
(_audit reference missing_)
:

- `constants/` sigue vacío en el core package
- Severity band: **MINOR**
- Cited file(s): _to be determined during investigation_

## Slices

### x00051-s1 — Fix: `constants/` sigue vacío en el core package

- **Status**: pending
- **Files**:
    - _<to be derived during investigation>_
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00051-constants-sigue-vacio-en-el-core-package.md
-->
