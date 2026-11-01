---
id: x00963
title: "commit-policy stages, trails and settles exactly what it says"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: bea174b6-630e-4980-bdc7-233d32bd871f
last-correlation-id: bea174b6-630e-4980-bdc7-233d32bd871f
last-transition-from: ready
last-transition-at: 2026-11-01T04:44:59.818Z
---

# x00963 — commit-policy stages, trails and settles exactly what it says

## goal

commit-policy stages paths with spaces and untracked folders file by file, keeps existing trailers, wires workspaceRoot and its integration and repair ports in production, registers the status tool its docs describe, derives direct-push permission like the engine, and the settlement cycle has a conductor and a quiet boundary that is atomic.

## why

gpt-6.1-sol's contribution and a00095. CP-02: gitDirtyFilePaths keeps porcelain quoting and cannot stage names with spaces. CP-07: triggers count an untracked folder as one file. CP-03: register omits workspaceRoot and disables the shared-index exclusion. CP-05: the co-authored-by trailer drops the header and existing trailers. CP-06: the documented status is not registered and docs keep stale defaults. CP-10: production registration does not connect candidates to the integration engine. CP-11: storm repair proposals have no store in production. CP-12 and G49: the settlement gate acknowledges a non-atomic quiet boundary and does not protect the transition it claims. G48: the settlement cycle (q00013) has its three pieces and no conductor. D50: commit_policy_status can say direct push is allowed when the engine would refuse it.

## non-goals

- WIP checkpoint ownership (x00947 S3).
- Trailer escaping (the escaping proposal S3).

## slices

- global_gate: type

### S1 — Staging and triggers
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/git-extra.ts`
- **Gate**: type
- acceptance:
  - "Paths are read with -z; a file with spaces is staged; an untracked folder counts its files (CP-02, CP-07)."

### S2 — Production wiring
- **Status**: pending
- **Files**: `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/src/lib/tools/storms-tool.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/skills/read-stderr-storm/SKILL.md`
- **Gate**: type
- acceptance:
  - "register passes workspaceRoot (CP-03); status is registered and the docs show the real defaults (CP-06). A candidate reports `work publish` as its way to integration (CP-10), and the storm surface promises no filing, its unreachable filer removed (CP-11)."

### S3 — Trailers, status and settlement
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/src/lib/tools/status-tool.ts`, `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/settlement/worker.registry.ts`, `plugins/commit-policy/src/lib/settlement/settlement-gate.helper.ts`, `plugins/commit-policy/src/lib/tools/settlement-tool.ts`
- **Gate**: type
- acceptance:
  - "Adding a trailer keeps the subject, body and existing trailers (CP-05)."
  - "status derives permission with the engine's function (D50)."
  - "The settlement tool conducts the cycle (enter, complete); entering is atomic with slice admission under one lock, and a slice holds the boundary until its event ends (G48, G49, CP-12)."

## acceptance

- Paths are read with -z; a file with spaces is staged; an untracked folder counts its files (CP-02, CP-07).
- register passes workspaceRoot (CP-03); status is registered and the docs show the real defaults (CP-06). A candidate reports `work publish` as its way to integration (CP-10), and the storm surface promises no filing, its unreachable filer removed (CP-11).
- Adding a trailer keeps the subject, body and existing trailers (CP-05).
- status derives permission with the engine's function (D50).
- The settlement tool conducts the cycle (enter, complete); entering is atomic with slice admission under one lock, and a slice holds the boundary until its event ends (G48, G49, CP-12).
