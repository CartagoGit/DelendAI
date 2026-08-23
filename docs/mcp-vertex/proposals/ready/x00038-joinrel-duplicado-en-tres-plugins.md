---
id: x00038
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `joinRel` duplicado en tres plugins
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00038 — `joinRel` duplicado en tres plugins

## Goal

Address the `MINOR` finding surfaced by the originating audit
(_audit reference missing_)
:

- `joinRel` duplicado en tres plugins
- Severity band: **MINOR**
- Cited file(s): _to be determined during investigation_

## Slices

### x00038-s1 — Fix: `joinRel` duplicado en tres plugins

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00038-joinrel-duplicado-en-tres-plugins.md
-->
