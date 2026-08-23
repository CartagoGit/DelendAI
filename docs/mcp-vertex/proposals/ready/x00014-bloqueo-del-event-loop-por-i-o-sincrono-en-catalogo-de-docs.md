---
id: x00014
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: Bloqueo del Event Loop por I/O síncrono en catálogo de docs
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00014 — Bloqueo del Event Loop por I/O síncrono en catálogo de docs

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- Bloqueo del Event Loop por I/O síncrono en catálogo de docs
- Severity band: **FATAL**
- Cited file(s): _to be determined during investigation_

## Slices

### x00014-s1 — Fix: Bloqueo del Event Loop por I/O síncrono en catálogo de docs

- **Status**: pending
- **Files**:
    - _<to be derived during investigation>_
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00014-bloqueo-del-event-loop-por-i-o-sincrono-en-catalogo-de-docs.md
-->
