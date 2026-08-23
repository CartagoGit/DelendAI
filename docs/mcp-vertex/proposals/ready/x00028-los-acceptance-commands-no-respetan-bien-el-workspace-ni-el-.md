---
id: x00028
status: ready
type: proposal
track: fix
date: 2026-08-23
kind: fix
title: Los acceptance commands no respetan bien el workspace ni el shell
shipped-in: []
recan: []
related:
    - _<add related proposal ids here>_
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# x00028 — Los acceptance commands no respetan bien el workspace ni el shell

## Goal

Address the `BAD` finding surfaced by the originating audit
(_audit reference missing_)
:

- Los acceptance commands no respetan bien el workspace ni el shell
- Severity band: **BAD**
- Cited file(s): _to be determined during investigation_

## Slices

### x00028-s1 — Fix: Los acceptance commands no respetan bien el workspace ni el shell

- **Status**: pending
- **Files**:
    - _<to be derived during investigation>_
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
  Suggested output dir: docs/mcp-vertex/proposals/ready/x00028-los-acceptance-commands-no-respetan-bien-el-workspace-ni-el-.md
-->
