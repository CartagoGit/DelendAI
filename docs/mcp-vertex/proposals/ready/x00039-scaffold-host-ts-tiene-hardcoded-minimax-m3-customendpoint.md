---
id: x00039
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `scaffold-host.ts` tiene hardcoded `MiniMax-M3 (customendpoint)`
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00039 — `scaffold-host.ts` tiene hardcoded `MiniMax-M3 (customendpoint)`

## Goal

Address the `MINOR` finding surfaced by the originating audit
(_audit reference missing_)
:

- `scaffold-host.ts` tiene hardcoded `MiniMax-M3 (customendpoint)`
- Severity band: **MINOR**
- Cited file(s): `[`

## Slices

### x00039-s1 — Fix: `scaffold-host.ts` tiene hardcoded `MiniMax-M3 (customendpoint)`

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00039-scaffold-host-ts-tiene-hardcoded-minimax-m3-customendpoint.md
-->
