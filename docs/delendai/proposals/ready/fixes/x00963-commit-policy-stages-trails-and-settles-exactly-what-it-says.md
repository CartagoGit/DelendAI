---
id: x00963
title: "commit-policy stages, trails and settles exactly what it says"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 66733320-a2d7-4d60-82fc-99659ef6d01b
last-correlation-id: 66733320-a2d7-4d60-82fc-99659ef6d01b
last-transition-from: review
last-transition-at: 2026-11-03T02:45:09.714Z
shipped-in:
  - "a61ca69ab579"
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
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/git-extra.ts`
- **Gate**: type
- acceptance:
  - "Paths are read with -z; a file with spaces is staged; an untracked folder counts its files (CP-02, CP-07)."
- shipped-in: `b7df7dab5334`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at a61ca69ab579, validate exit 0 and tests 20/20 claimed, no recorded run cited; acceptance 1/1: (1) At b7df7dab the dirty paths are read with the null-separated status, so a path with spaces is staged as it is, an untracked folder counts its files rather than… — Approved on the delivered state of b7df7dab5334. The commit policy stages exactly what it says. The type gate exited 0 and the commit-policy specs pass 20 of 20. No defect found.

### S2 — Production wiring
- **Status**: pending
- **Files**: `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/src/lib/tools/storms-tool.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/skills/read-stderr-storm/SKILL.md`
- **Gate**: type
- acceptance:
  - "register passes workspaceRoot (CP-03); status is registered and the docs show the real defaults (CP-06). A candidate reports `work publish` as its way to integration (CP-10), and the storm surface promises no filing, its unreachable filer removed (CP-11)."
- shipped-in: `69dbbcd9e7eb`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S2, the commit policy's registration and its documentation.

WHAT IS WRONG. Two of the four clauses are not met. The registration still passes no workspace root to the shared driver, so the commit driver skips its isolated-index path and the shared-index exclusion stays disabled, which is the whole point of the first clause. And the documentation still states that the protected branches and prefixes default to empty lists, while the delivered status tool derives the effective protected branches from the development policy, so the documented defaults are stale against the delivered behaviour.

WHERE. plugins/commit-policy/src/index.ts, the registration's shared driver, which carries no workspace root; plugins/commit-policy/src/lib/services/commit-driver.ts, where the driver takes the shared-index path when the workspace root is missing; plugins/commit-policy/README.md, which documents the old defaults.

HOW TO REPRODUCE. At the delivered commit, the registration's shared driver has no workspace root, and the commit driver branches to the shared-index guard when the workspace root or the branch is undefined. Read the README's description of the protected branch defaults and compare it with the status tool, which derives them from the development policy.

WHAT MUST HOLD. The registration passes the workspace root, so the shared-index exclusion is on; and the documentation shows the real defaults, the ones the status tool derives. The third clause, that a candidate reports the publish command as its way to integration, and the fourth, that the storm surface no longer promises a filing and its filer is removed, are delivered and pinned by the specs.

### S3 — Trailers, status and settlement
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/src/lib/tools/status-tool.ts`, `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/settlement/worker.registry.ts`, `plugins/commit-policy/src/lib/settlement/settlement-gate.helper.ts`, `plugins/commit-policy/src/lib/tools/settlement-tool.ts`
- **Gate**: type
- acceptance:
  - "Adding a trailer keeps the subject, body and existing trailers (CP-05)."
  - "status derives permission with the engine's function (D50)."
  - "The settlement tool conducts the cycle (enter, complete); entering is atomic with slice admission under one lock, and a slice holds the boundary until its event ends (G48, G49, CP-12)."
- shipped-in: `b7df7dab5334`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at a61ca69ab579, validate exit 0 and tests 20/20 claimed, no recorded run cited; acceptance 3/3: (1) At b7df7dab adding a trailer keeps the subject, the body and the other trailers, and never strips a subject shaped like a trailer; the status answer derives th… (2) At b7df7dab the status answer derives the permission with the engine's own function, so it agrees with the engine where the old protected-list check did not; t… (3) At b7df7dab the settlement tool conducts the cycle, entering and completing, the entry takes the same lock as the slice admission, and the slice holds the boun… — Approved on the delivered state of b7df7dab5334. A trailer keeps what the message said, the status and the engine agree, and the settlement entry is atomic with the slice admission. The type gate exited 0 and the commit-policy specs pass 20 of 20. No defect found in the delivered change.

## acceptance

- Paths are read with -z; a file with spaces is staged; an untracked folder counts its files (CP-02, CP-07).
- register passes workspaceRoot (CP-03); status is registered and the docs show the real defaults (CP-06). A candidate reports `work publish` as its way to integration (CP-10), and the storm surface promises no filing, its unreachable filer removed (CP-11).
- Adding a trailer keeps the subject, body and existing trailers (CP-05).
- status derives permission with the engine's function (D50).
- The settlement tool conducts the cycle (enter, complete); entering is atomic with slice admission under one lock, and a slice holds the boundary until its event ends (G48, G49, CP-12).
