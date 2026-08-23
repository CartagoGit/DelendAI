---
id: x00018
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `scanLiveProposalEntries` en `round-context.ts` tiene un `TODO` hardcodeado
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00018 — `scanLiveProposalEntries` en `round-context.ts` tiene un `TODO` hardcodeado

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- `scanLiveProposalEntries` en `round-context.ts` tiene un `TODO` hardcodeado
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00018-s1 — Fix: `scanLiveProposalEntries` en `round-context.ts` tiene un `TODO` hardcodeado

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00018-scanliveproposalentries-en-round-context-ts-tiene-un-todo-ha.md
-->
