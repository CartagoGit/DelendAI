---
id: x00904
title: "A server started inside a workspace member serves the workspace, and what the old ones left goes"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-14
last-transition-id: cc608930-8726-4093-80c6-f209511e8f25
last-correlation-id: cc608930-8726-4093-80c6-f209511e8f25
last-transition-from: review
last-transition-at: 2026-10-15T00:20:20.645Z
shipped-in:
  - "ee0dfe5f0546"
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

- **Status**: done
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
- shipped-in: `ee0dfe5f0546`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at ee0dfe5f0546, validate exit 0, tests 8/8; acceptance 3/3: (1) packages/core/tests/src/lib/workspace/nearest-configured-root.helper.spec.ts passed in the focused 8/8 run, covering climb-to-configured-root, staying put when… (2) packages/core/tests/src/lib/workspace-migration/migrators/stray-member-cache.migrator.spec.ts passed in the focused 8/8 run, covering safe removal of regenerab… (3) In this checkout the stray member cache has already been consumed by the delivered migration, so the current dry-run plan is empty rather than showing the hist…

## acceptance

- After the next start, `packages/core/.cache` is gone and `lint:cache` passes in the shared checkout.
