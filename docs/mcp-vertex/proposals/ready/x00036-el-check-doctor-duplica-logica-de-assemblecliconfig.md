---
id: x00036
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: El `--check`/`--doctor` duplica lógica de `assembleCliConfig`
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00036 — El `--check`/`--doctor` duplica lógica de `assembleCliConfig`

## Goal

Address the `MINOR` finding surfaced by the originating audit
(_audit reference missing_)
:

- El `--check`/`--doctor` duplica lógica de `assembleCliConfig`
- Severity band: **MINOR**
- Cited file(s): `[`

## Slices

### x00036-s1 — Fix: El `--check`/`--doctor` duplica lógica de `assembleCliConfig`

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00036-el-check-doctor-duplica-logica-de-assemblecliconfig.md
-->
