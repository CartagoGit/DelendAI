---
id: x00002
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: `agent-lock-engine.ts` usa `resolveWorkspacePath` como fallback hardcoded
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00002 — `agent-lock-engine.ts` usa `resolveWorkspacePath` como fallback hardcoded

## Goal

Address the `FATAL` finding surfaced by the originating audit
(_audit reference missing_)
:

- `agent-lock-engine.ts` usa `resolveWorkspacePath` como fallback hardcoded
- Severity band: **FATAL**
- Cited file(s): `[`

## Slices

### x00002-s1 — Fix: `agent-lock-engine.ts` usa `resolveWorkspacePath` como fallback hardcoded

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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00002-agent-lock-engine-ts-usa-resolveworkspacepath-como-fallback-.md
-->
