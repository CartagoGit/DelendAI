---
id: x00031
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `lockPath` opcional en `ITaskQueuePaths` con fallback al layout hardcoded
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00031 — `lockPath` opcional en `ITaskQueuePaths` con fallback al layout hardcoded

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- `lockPath` opcional en `ITaskQueuePaths` con fallback al layout hardcoded
- Severity band: **BAD**
- Cited file(s): `[`

## Slices

### x00031-s1 — Fix: `lockPath` opcional en `ITaskQueuePaths` con fallback al layout hardcoded

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00031-lockpath-opcional-en-itaskqueuepaths-con-fallback-al-layout-.md
-->
