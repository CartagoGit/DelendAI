---
id: x00635
title: "An automatic operation leaves uncommitted work as it found it"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-24
shipped-in: ["4177e3af9"]
last-transition-id: ba7c31e4-8c3b-43c6-86bb-8e3170d2287b
last-correlation-id: ba7c31e4-8c3b-43c6-86bb-8e3170d2287b
last-transition-from: review
---

# x00635 — An automatic operation leaves uncommitted work as it found it

## goal

One definition of "left as found", and every automatic operation that
runs in somebody's working tree tested against it.

## why

Asked for by an external review on 2026-09-24, after two regressions on
the same day: a post-merge refresh committed an uncommitted edit (x00628
S5) and a throwaway worktree rewrote the clone's shared configuration
(x00628 S4). Each automatic operation had grown its own test for this
after breaking it once, each checking a slightly different thing. The
review's point: the property is one ("an automatic operation preserves
pre-existing dirty state byte for byte"), so the check should be one too,
not a new test each time a script gets it wrong.

## why this design

- `captureWorkingState` / `workingStateChanges` in `@delendai/test-kit`
  define the property once: every path that differed from HEAD keeps its
  bytes and its exact index entry (so a partial stage is not promoted),
  none of them ends up committed, and no clean path becomes dirty.
- Applied to the automatic operations that run in a tree someone may be
  editing: the post-merge generated refresh, work publication, candidate
  hydration (the checkout it runs from), namespace maintenance, `prepare`
  in a linked worktree, and the work-checkout publisher (both the agent's
  checkout and the host's).

## non-goals

- The WIP checkpoint's `cleanAfterCheckpoint`, which by design removes
  the paths it has just checkpointed to a work ref.

## Slices

- global_gate: none

### S1 — One "left as found" check, applied to every automatic operation

- **Status**: done
- **Gate**: `npx vitest run packages/test-kit/tests/src/lib/working-state.helper.spec.ts`
- **Files**: `packages/test-kit/src/contracts/interfaces/working-state.interface.ts`,
  `packages/test-kit/src/lib/working-state.helper.ts`,
  `packages/test-kit/src/public/index.ts`,
  `packages/test-kit/tests/src/lib/working-state.helper.spec.ts`,
  `packages/cli/src/lib/generated-refresh.service.spec.ts`,
  `packages/cli/src/lib/work-publish.service.spec.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`,
  `tools/scripts/git/maintain-ref-namespace.script.spec.ts`,
  `tools/scripts/git/prepare-clone.script.spec.ts`,
  `plugins/commit-policy/tests/src/lib/services/work-checkout-publisher.service.spec.ts`
- The helper's own spec shows it catching rewritten content, a promoted
  partial stage, work swept into a commit, and a clean file made dirty.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 4177e3af9d. PR MERGED. One "left as found" check, applied to every automatic operation
- review-attribution: claude-opus-5-5 from commit 4177e3af9db6 names refs/heads/delendai/wip/claude-opus-5-5/x00635-S1-g1/automatic-operations-keep-dirty-state (4177e3af9db6f684f7f3b6919e082763c0148e0f), opened by minimax-3
## acceptance

- A new automatic operation is tested with `workingStateChanges`, not
  with a check of its own.
