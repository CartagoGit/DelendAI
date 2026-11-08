---
id: x01053
title: "The merge train is pushed: a failed generator commits nothing and an empty source fails loudly"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: 20a8192c-75f1-41a6-a4bd-5ab6ced42b3a
last-correlation-id: 20a8192c-75f1-41a6-a4bd-5ab6ced42b3a
last-transition-from: ready
last-transition-at: 2026-11-08T13:45:31.136Z
---

# x01053 — The merge train is pushed: a failed generator commits nothing and an empty source fails loudly

## goal

The merge train is assembled and pushed. A post-merge refresh in which any generator failed commits nothing, restores every bounded path and reports the failed generators. A generator that finds nothing to generate from in a repository that has the sources fails instead of writing an empty file. The train's scratch worktree has the shared dependencies, so its generators run.

## why

Evidence 2026-11-08. assembleTrain (tools/scripts/forge/train-assembly.ts) merges in a scratch git worktree under the tmpdir with no node_modules. The generators cannot load the code there: one exited 0 and wrote managed-lazy-catalog.generated.ts empty (1,782 deletions), the others failed, and generated-refresh.service.ts committed 'chore(generated): recompute after a merge' anyway. The pre-push hooks then crash on the missing MANAGED_LAZY_PLUGIN_CATALOG export and the push of delendai/train/... fails: the train is never pushed. Reproduced locally with develop plus PR heads 1778, 1800, 1808 and 1834 and git push --dry-run.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — A refresh in which a generator failed commits nothing
- **Status**: pending
- **Files**: `packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`
- **Gate**: type
- acceptance:
  - "When any generator fails, refreshGeneratedAfterMerge commits nothing, restores every bounded path from its snapshot and reports the failed generators (generated-refresh.service.spec.ts)."

### S2 — A generator with nothing to generate from fails loudly
- **Status**: pending
- **Files**: `tools/scripts/generate/managed-lazy-catalog.script.ts`, `tools/scripts/generate/managed-lazy-catalog.script.spec.ts`, `tools/scripts/generate/from-manifests.script.ts`, `tools/scripts/generate/from-manifests.script.spec.ts`
- **Gate**: type
- acceptance:
  - "The managed-lazy catalog generator throws when no plugin loaded in a repository whose first-party index has plugins, and writes no file (managed-lazy-catalog.script.spec.ts)."
  - "The manifests generator throws when plugin packages exist and no manifest loaded (from-manifests.script.spec.ts)."

### S3 — The train's scratch worktree has the shared dependencies
- **Status**: pending
- **Files**: `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/train-assembly.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: type
- acceptance:
  - "Assembling a train whose members touch generated files pushes a tree whose generated files equal a fresh regeneration; the scratch worktree is linked to the shared dependencies with linkSharedDependencies before the generators run (train-assembly.spec.ts)."

## acceptance

- When any generator fails, refreshGeneratedAfterMerge commits nothing, restores every bounded path from its snapshot and reports the failed generators (generated-refresh.service.spec.ts).
- The managed-lazy catalog generator throws when no plugin loaded in a repository whose first-party index has plugins, and writes no file (managed-lazy-catalog.script.spec.ts).
- The manifests generator throws when plugin packages exist and no manifest loaded (from-manifests.script.spec.ts).
- Assembling a train whose members touch generated files pushes a tree whose generated files equal a fresh regeneration; the scratch worktree is linked to the shared dependencies with linkSharedDependencies before the generators run (train-assembly.spec.ts).
