---
id: x00025
status: ready
type: proposal
track: plugins+fix
date: 2026-08-23
kind: fix
title: Guardado y eliminación en `memory` vulnerables a escrituras concurrentes (RMW)
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00025 — Guardado y eliminación en `memory` vulnerables a escrituras concurrentes (RMW)

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- Guardado y eliminación en `memory` vulnerables a escrituras concurrentes (RMW)
- Severity band: **BAD**
- Cited file(s): `[store.ts#L63](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L63) y [store.ts#L108](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L108)`

## Slices

### x00025-s1 — Fix: Guardado y eliminación en `memory` vulnerables a escrituras concurrentes (RMW)

- **Status**: pending
- **Files**:
    - `[store.ts#L63](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L63) y [store.ts#L108](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L108)`
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00025-guardado-y-eliminacion-en-memory-vulnerables-a-escrituras-co.md
-->
