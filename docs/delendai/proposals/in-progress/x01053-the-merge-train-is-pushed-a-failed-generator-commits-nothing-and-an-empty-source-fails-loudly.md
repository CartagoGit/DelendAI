---
id: x01053
title: "The merge train is pushed: a failed generator commits nothing and an empty source fails loudly"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: ea6f6fed-7b23-42b9-91ad-bada51411c92
last-correlation-id: ea6f6fed-7b23-42b9-91ad-bada51411c92
last-transition-from: review
last-transition-at: 2026-11-08T14:28:48.043Z
---

# x01053 — The merge train is pushed: a failed generator commits nothing and an empty source fails loudly

## goal

The merge train is assembled and pushed. A post-merge refresh in which any generator failed commits nothing, restores every bounded path and reports the failed generators. A generator that finds nothing to generate from in a repository that has the sources fails instead of writing an empty file. The train's scratch worktree has the shared dependencies, so its generators run.

## why

Evidence 2026-11-08. assembleTrain (tools/scripts/forge/train-assembly.ts) merges in a scratch git worktree under the tmpdir with no node_modules. The generators cannot load the code there: one exited 0 and wrote managed-lazy-catalog.generated.ts empty (1,782 deletions), the others failed, and generated-refresh.service.ts committed 'chore(generated): recompute after a merge' anyway. The pre-push hooks then crash on the missing MANAGED_LAZY_PLUGIN_CATALOG export and the push of delendai/train/... fails: the train is never pushed. Reproduced locally with develop plus PR heads 1778, 1800, 1808 and 1834 and git push --dry-run.

## non-goals

- Changing which generators gen:all runs, or how the train picks its members.

## slices

- global_gate: none

### S1 — A refresh in which a generator failed commits nothing
- **Status**: review
- **Files**: `packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`
- **Gate**: type
- acceptance:
  - "When any generator fails, refreshGeneratedAfterMerge commits nothing, restores every bounded path from its snapshot and reports the failed generators (generated-refresh.service.spec.ts)."
- shipped-in: `a6660aac29c5`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — A generator with nothing to generate from fails loudly
- **Status**: review
- **Files**: `tools/scripts/generate/managed-lazy-catalog.script.ts`, `tools/scripts/generate/managed-lazy-catalog.script.spec.ts`, `tools/scripts/generate/from-manifests.script.ts`, `tools/scripts/generate/from-manifests.script.spec.ts`
- **Gate**: type
- acceptance:
  - "The managed-lazy catalog generator throws when no plugin loaded in a repository whose first-party index has plugins, and writes no file (managed-lazy-catalog.script.spec.ts)."
  - "The manifests generator throws when plugin packages exist and no manifest loaded (from-manifests.script.spec.ts)."
- shipped-in: `a6660aac29c5`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — The train's scratch worktree has the shared dependencies
- **Status**: review
- **Files**: `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/train-assembly.spec.ts`, `tools/scripts/forge/link-train-dependencies.script.ts`, `packages/core/src/cli.ts`
- **Gate**: type
- acceptance:
  - "Assembling a train whose members touch generated files pushes a tree whose generated files equal a fresh regeneration; the scratch worktree is linked to the shared dependencies with linkSharedDependencies before the generators run (train-assembly.spec.ts)."
- shipped-in: `a6660aac29c5`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S4 — A train that cannot run leaves its riders to the individual path
- **Status**: review
- **Files**: `tools/scripts/forge/queue-acceptance.ts`, `tools/scripts/forge/queue-acceptance.spec.ts`, `tools/scripts/forge/train-fallback.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`
- **Gate**: type
- acceptance:
  - "When no pushed train carries a behind rider and the integration tip has stood past the grace, the rider is not left to the train: it is brought forward by the individual path (queue order, urgent first, capped per pass), re-runs its own checks and lands by its own merge once green; while a train carries it, or within the grace, it is left to the train (queue-acceptance.spec.ts)."
- shipped-in: `a3263946a749`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S5 — Every train regenerates its derived files once, conflict or not
- **Status**: in-progress
- **Files**: `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/train-assembly.spec.ts`
- **Gate**: none

With S1–S4 on develop the train was still declined: a member that left the integration branch long ago merges cleanly, yet leaves derived files (the skill copies under .github, .claude, .agents) stale against the tip, and the push's drift check refused the train. The regeneration ran only after a derived conflict. It now runs once on every train after all its members are in; a failed link or regeneration pushes nothing and says why.

## acceptance

- When any generator fails, refreshGeneratedAfterMerge commits nothing, restores every bounded path from its snapshot and reports the failed generators (generated-refresh.service.spec.ts).
- The managed-lazy catalog generator throws when no plugin loaded in a repository whose first-party index has plugins, and writes no file (managed-lazy-catalog.script.spec.ts).
- The manifests generator throws when plugin packages exist and no manifest loaded (from-manifests.script.spec.ts).
- Assembling a train whose members touch generated files pushes a tree whose generated files equal a fresh regeneration; the scratch worktree is linked to the shared dependencies with linkSharedDependencies before the generators run (train-assembly.spec.ts).
- When the train cannot run and every candidate is behind, the candidates are brought forward one by one and none waits forever (queue-acceptance.spec.ts).
- A train whose members merged cleanly is regenerated once before it is pushed, and a failed regeneration pushes nothing.
