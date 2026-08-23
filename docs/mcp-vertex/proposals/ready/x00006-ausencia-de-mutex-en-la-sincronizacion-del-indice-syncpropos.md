---
id: x00006
status: ready
type: proposal
track: plugins+fix
date: 2026-08-23
kind: fix
title: Ausencia de Mutex en la sincronización del índice (`syncProposalRegistry`)
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00006 — Ausencia de Mutex en la sincronización del índice (`syncProposalRegistry`)

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- Ausencia de Mutex en la sincronización del índice (`syncProposalRegistry`)
- Severity band: **FATAL**
- Cited file(s): `[sync-proposal-registry.ts#L311](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L311)`

## Slices

### x00006-s1 — Fix: Ausencia de Mutex en la sincronización del índice (`syncProposalRegistry`)

- **Status**: pending
- **Files**:
    - `[sync-proposal-registry.ts#L311](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L311)`
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00006-ausencia-de-mutex-en-la-sincronizacion-del-indice-syncpropos.md
-->
