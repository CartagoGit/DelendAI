---
id: x00904
title: "A server started inside a workspace member serves the workspace, and what the old ones left goes"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: 79cec78e-684a-40cd-bf04-c50e9b3660cd
last-correlation-id: 79cec78e-684a-40cd-bf04-c50e9b3660cd
last-transition-from: in-progress
last-transition-at: 2026-10-14T23:05:34.751Z
---

# x00904 — A server started inside a workspace member serves the workspace, and what the old ones left goes

## goal

A delendai server started anywhere inside a configured workspace serves that workspace, and the caches earlier servers wrote inside its members are removed at start, journalled.

## why

`packages/core/.cache/delendai` (runtime events and evidence, written on 2026-10-01 in one second and never read) made `lint:cache` fail on every reviewer's `validate`, and q00011 S9 was sent back for it. Without `--workspace`, the server took its working directory for the workspace: started from `packages/core`, it served that directory, read no configuration and wrote its cache there. The 0 → 1 cache layout step that consolidated the sub-project caches only touches the cache directory, so it never removed one; and nothing stopped a new one being written.

## non-goals

- Touching a member that is a project of its own (it has its own `delendai.config.json`), or a cache that holds anything that does not regenerate: those are reported, not removed.

## slices

- global_gate: type

### S1 — The workspace is the nearest configured directory, and the stray caches go at start

- **Status**: review
- **Files**:
  - `packages/core/src/lib/workspace/nearest-configured-root.helper.ts`
  - `packages/core/src/lib/plugins/parse-cli-args.ts`
  - `packages/core/src/lib/scan/dip-violation.ts`
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.migrator.ts`
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.constant.ts`
  - `packages/core/src/lib/workspace-migration/migration-registry.ts`
  - `packages/core/tests/src/lib/workspace/nearest-configured-root.helper.spec.ts`
  - `packages/core/tests/src/lib/workspace-migration/migrators/stray-member-cache.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - Without `--workspace`, the server serves the nearest directory up from its working directory that holds `delendai.config.json`, never leaving the repository; with none, its working directory, as before.
  - At start, the workspace migrations remove `<member>/.cache/delendai` from the directories one and two levels down when everything in it regenerates (runtime, evidence, results, logs, scratch), and `.cache` with it when it is left empty; a cache holding anything else, and a member with its own configuration, are left and reported. The run is journalled like every other migration.
  - Run against this repository it plans exactly one removal: `packages/core/.cache/delendai`.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `ee0dfe5f0546`

## acceptance

- After the next start, `packages/core/.cache` is gone and `lint:cache` passes in the shared checkout.
