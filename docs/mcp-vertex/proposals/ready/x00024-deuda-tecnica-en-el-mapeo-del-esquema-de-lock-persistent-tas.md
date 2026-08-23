---
id: x00024
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: Deuda técnica en el mapeo del esquema de Lock (`persistent-task-queue.ts`)
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00024 — Deuda técnica en el mapeo del esquema de Lock (`persistent-task-queue.ts`)

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- Deuda técnica en el mapeo del esquema de Lock (`persistent-task-queue.ts`)
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00024-s1 — Fix: Deuda técnica en el mapeo del esquema de Lock (`persistent-task-queue.ts`)

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00024-deuda-tecnica-en-el-mapeo-del-esquema-de-lock-persistent-tas.md
-->
