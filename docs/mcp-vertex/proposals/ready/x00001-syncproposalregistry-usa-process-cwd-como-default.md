---
id: x00001
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `syncProposalRegistry` usa `process.cwd()` como default
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00001 — `syncProposalRegistry` usa `process.cwd()` como default

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- `syncProposalRegistry` usa `process.cwd()` como default
- Severity band: **FATAL**
- Cited file(s): `[`

## Slices

### x00001-s1 — Fix: `syncProposalRegistry` usa `process.cwd()` como default

- **Status**: pending
- **Files**:
    - `[`
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00001-syncproposalregistry-usa-process-cwd-como-default.md
-->
