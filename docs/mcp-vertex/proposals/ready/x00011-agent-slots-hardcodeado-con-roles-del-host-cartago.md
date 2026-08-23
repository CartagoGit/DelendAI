---
id: x00011
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `AGENT_SLOTS` hardcodeado con roles del host Cartago
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00011 — `AGENT_SLOTS` hardcodeado con roles del host Cartago

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- `AGENT_SLOTS` hardcodeado con roles del host Cartago
- Severity band: **FATAL**
- Cited file(s): `[`

## Slices

### x00011-s1 — Fix: `AGENT_SLOTS` hardcodeado con roles del host Cartago

- **Status**: pending
- **Files**:
    - `[`
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00011-agent-slots-hardcodeado-con-roles-del-host-cartago.md
-->
