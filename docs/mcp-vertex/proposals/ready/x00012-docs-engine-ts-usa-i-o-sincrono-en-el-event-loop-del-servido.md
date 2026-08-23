---
id: x00012
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `docs/engine.ts` usa I/O síncrono en el event loop del servidor MCP
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00012 — `docs/engine.ts` usa I/O síncrono en el event loop del servidor MCP

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- `docs/engine.ts` usa I/O síncrono en el event loop del servidor MCP
- Severity band: **FATAL**
- Cited file(s): `[`

## Slices

### x00012-s1 — Fix: `docs/engine.ts` usa I/O síncrono en el event loop del servidor MCP

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00012-docs-engine-ts-usa-i-o-sincrono-en-el-event-loop-del-servido.md
-->
