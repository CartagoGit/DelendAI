---
id: x00017
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `IProposalTrack` con valores de dominio específicos del host
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00017 — `IProposalTrack` con valores de dominio específicos del host

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- `IProposalTrack` con valores de dominio específicos del host
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00017-s1 — Fix: `IProposalTrack` con valores de dominio específicos del host

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00017-iproposaltrack-con-valores-de-dominio-especificos-del-host.md
-->
