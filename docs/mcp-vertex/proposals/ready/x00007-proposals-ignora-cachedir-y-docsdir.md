---
id: x00007
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `proposals` ignora `cacheDir` y `docsDir`
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00007 — `proposals` ignora `cacheDir` y `docsDir`

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- `proposals` ignora `cacheDir` y `docsDir`
- Severity band: **FATAL**
- Cited file(s): _to be determined during investigation_

## Slices

### x00007-s1 — Fix: `proposals` ignora `cacheDir` y `docsDir`

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00007-proposals-ignora-cachedir-y-docsdir.md
-->
