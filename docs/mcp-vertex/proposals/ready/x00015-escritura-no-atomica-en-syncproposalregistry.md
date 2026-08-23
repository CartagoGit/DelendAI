---
id: x00015
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: Escritura NO atómica en `syncProposalRegistry`
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00015 — Escritura NO atómica en `syncProposalRegistry`

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- Escritura NO atómica en `syncProposalRegistry`
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00015-s1 — Fix: Escritura NO atómica en `syncProposalRegistry`

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00015-escritura-no-atomica-en-syncproposalregistry.md
-->
