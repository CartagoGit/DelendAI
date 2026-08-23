---
id: x00052
status: ready
type: proposal
track: core+fix
date: 2026-08-23
kind: fix
title: Hardcoded core tool registrations
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00052 — Hardcoded core tool registrations

## Goal

Address the `MINOR` finding surfaced by the originating audit
(_audit reference missing_)
:

- Hardcoded core tool registrations
- Severity band: **MINOR**
- Cited file(s): `packages/core/src/lib/project/create-mcp-project.ts`

## Slices

### x00052-s1 — Fix: Hardcoded core tool registrations

- **Status**: pending
- **Files**:
    - `packages/core/src/lib/project/create-mcp-project.ts`
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00052-hardcoded-core-tool-registrations.md
-->
