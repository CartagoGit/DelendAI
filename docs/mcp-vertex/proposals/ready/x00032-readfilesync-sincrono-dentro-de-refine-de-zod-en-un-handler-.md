---
id: x00032
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `readFileSync` síncrono dentro de refine de Zod en un handler async
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00032 — `readFileSync` síncrono dentro de refine de Zod en un handler async

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- `readFileSync` síncrono dentro de refine de Zod en un handler async
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00032-s1 — Fix: `readFileSync` síncrono dentro de refine de Zod en un handler async

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00032-readfilesync-sincrono-dentro-de-refine-de-zod-en-un-handler-.md
-->
