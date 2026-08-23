---
id: x00034
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `persistent-task-queue.ts` — idempotencia de `subscribe` solo en memoria
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00034 — `persistent-task-queue.ts` — idempotencia de `subscribe` solo en memoria

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- `persistent-task-queue.ts` — idempotencia de `subscribe` solo en memoria
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00034-s1 — Fix: `persistent-task-queue.ts` — idempotencia de `subscribe` solo en memoria

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00034-persistent-task-queue-ts-idempotencia-de-subscribe-solo-en-m.md
-->
