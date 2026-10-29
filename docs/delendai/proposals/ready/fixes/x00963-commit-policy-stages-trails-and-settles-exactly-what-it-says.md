---
id: x00963
title: "commit-policy stages, trails and settles exactly what it says"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Files**: `plugins/commit-policy/src/lib/services/git-extra.ts`, `plugins/commit-policy/src/lib/triggers/interval-timer.ts`, `plugins/commit-policy/src/lib/triggers/threshold-tracker.ts`
- **Gate**: type
- acceptance:
  - "Paths are read with -z; a file with spaces is staged; an untracked folder counts its files (CP-02, CP-07)."

### S2 — Production wiring
- **Status**: pending
- **Files**: `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/src/lib/services/git-write-lock.ts`, `plugins/commit-policy/src/lib/services/repair-proposer.ts`, `plugins/commit-policy/src/lib/tools/storms-tool.ts`, `packages/core/src/lib/integration-engine/index.ts`, `plugins/commit-policy/src/lib/contracts/options.ts`, `plugins/commit-policy/README.md`, `plugins/commit-policy/README.es.md`
- **Gate**: type
- acceptance:
  - "register passes workspaceRoot (CP-03), the integration port (CP-10) and a repair store (CP-11) in production; status is registered and the docs show the real defaults (CP-06)."

### S3 — Trailers, status and settlement
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/src/lib/tools/status-tool.ts`, `plugins/commit-policy/src/lib/persistence/derive-branch-policy.ts`, `plugins/commit-policy/src/lib/settlement/worker.registry.ts`, `plugins/commit-policy/src/lib/tools/settlement-tool.ts`
- **Gate**: type
- acceptance:
  - "Adding a trailer keeps the subject, body and existing trailers (CP-05)."
  - "status derives permission with the engine's function (D50)."
  - "A conductor drives setPhase and markGreen; the quiet boundary is taken under one lock and the gate guards the slice transition (G48, G49, CP-12)."

## acceptance

- Paths are read with -z; a file with spaces is staged; an untracked folder counts its files (CP-02, CP-07).
- register passes workspaceRoot (CP-03), the integration port (CP-10) and a repair store (CP-11) in production; status is registered and the docs show the real defaults (CP-06).
- Adding a trailer keeps the subject, body and existing trailers (CP-05).
- status derives permission with the engine's function (D50).
- A conductor drives setPhase and markGreen; the quiet boundary is taken under one lock and the gate guards the slice transition (G48, G49, CP-12).
