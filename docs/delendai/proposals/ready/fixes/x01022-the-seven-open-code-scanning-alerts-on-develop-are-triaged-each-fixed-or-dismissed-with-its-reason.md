---
id: x01022
title: "The seven open code-scanning alerts on develop are triaged, each fixed or dismissed with its reason"
kind: fix
status: ready
type: proposal
track: ci
date: 2026-11-04
---

# x01022 — The seven open code-scanning alerts on develop are triaged, each fixed or dismissed with its reason

## goal

Each of the 7 code-scanning alerts open on develop on 2026-11-04 is fixed, or dismissed with the reason it does not apply.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The lease scratch file alerts
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
- **Gate**: type
- acceptance:
  - "#477 and #478 are each fixed or dismissed on GitHub with the reason that the scratch name is inside the owned workspace cache; the decision is recorded in this proposal."

### S2 — The markdown parser expressions
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/markdown-parser.ts`
- **Gate**: type
- acceptance:
  - "#471, #472 and #473 are fixed by bounding the line length matched, with a spec of a 100000-space line that finishes quickly, or dismissed with a reason."

### S3 — The dockerfile and scaffolder expressions
- **Status**: pending
- **Files**: `plugins/container/src/lib/lint/parse-dockerfile.ts`, `plugins/audit/src/lib/services/proposal-scaffolder.service.ts`
- **Gate**: type
- acceptance:
  - "#474 and #475 are fixed with a spec of a pathological line, or dismissed with a reason."

## acceptance

- #477 and #478 are each fixed or dismissed on GitHub with the reason that the scratch name is inside the owned workspace cache; the decision is recorded in this proposal.
- #471, #472 and #473 are fixed by bounding the line length matched, with a spec of a 100000-space line that finishes quickly, or dismissed with a reason.
- #474 and #475 are fixed with a spec of a pathological line, or dismissed with a reason.
