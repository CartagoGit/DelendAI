---
id: x00943
title: "The proposals plugin's queue, journal and lookups never lose or invent state"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00943 — The proposals plugin's queue, journal and lookups never lose or invent state

## goal

A task survives its worker's death, the journal and quarantine keep every good entry, garbage collection only deletes what it read, plan and round lookups find proposals where they live, and a detail level or a loop verdict means what it says.

## why

Joint audit a00095. D6: the task queue has no cap and no reclaim; a task is lost when its worker dies. gpt-6.1-sol findings: PROP-JOURNAL01 quarantine append loses the first good entry after a torn tail; G61-PROP-SVC01 quarantine repair resolves proposal-relative paths against the workspace root; G61-PROP-SVC02 a fresh reconciliation does not clear stale warnings; G61-PROP-SVC03 mixed own and adopted commits are recorded as wholly carried; PROP-GC01 an unreadable worktree status becomes a clean GC candidate; PROP-GC02 the GC age limit is skipped for delivered worktrees; PROP-LINT01 the folder lint picks the first status-named ancestor; PROP-DOM01 the plan-blocker lookup uses the cache directory as document root; PROP-PLAN02 the parser dropped plan children before the closure guard (planBlocks in f00764 addresses it; verify); PROP-ROUND01/02 round-context misses canonical folders and counts the legacy spelling only; PROP-DETAIL01 proposal_get changes the detail label without the payload; PROP-LOOP01 returned MCP tool errors are suppressed as successful repeats.

## non-goals

- The lock files (x00942).
- Transition evidence (sibling proposal).

## slices

- global_gate: type

### S1 — The task queue reclaims a dead worker's task
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/agents/persistent-task-queue.ts`
- **Gate**: type
- acceptance:
  - "A task leased by a worker whose lease expired returns to the queue; a spec kills the worker mid-task and the task is delivered once to the next worker (D6)."
  - "enqueue refuses past a configured cap with a typed error instead of growing without bound."

### S2 — Journal, quarantine and reconciliation keep every good entry
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/quarantine.ts`, `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/src/lib/proposals/filename-linter.ts`, `packages/proposals-sqlite/src/lib/reconciler-staging.ts`, `packages/proposals-sqlite/src/lib/repository/quarantine-repo.ts`, `packages/proposals-sqlite/src/lib/set-aside.service.ts`, `plugins/proposals/src/lib/services/db-doctor.ts`, `plugins/proposals/src/lib/services/db-doctor/checks/stale-reconciliation.ts`, `plugins/proposals/src/lib/tools/quarantine-repair.tool.ts`, `plugins/proposals/src/lib/tools/db-reconcile.tool.ts`, `plugins/proposals/src/lib/tools/db-doctor.tool.ts`
- **Gate**: type
- acceptance:
  - "Appending after a torn tail keeps the first good entry (PROP-JOURNAL01)."
  - "Quarantine repair resolves a proposal-relative source against the proposals directory (G61-PROP-SVC01)."
  - "A successful reconciliation clears the stale-reconciliation warning of earlier runs (G61-PROP-SVC02)."
  - "The folder lint uses the nearest status-named ancestor (PROP-LINT01)."
  - "Each case has a spec that fails on develop today."

### S3 — Garbage collection deletes only what it read and aged
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/shared/branch-gc-engine.ts`, `plugins/proposals/src/lib/shared/branch-status-engine.ts`, `plugins/proposals/src/lib/tools/branch-gc.tool.ts`
- **Gate**: type
- acceptance:
  - "A worktree whose status cannot be read is kept and reported, never classified clean (PROP-GC01)."
  - "The age limit applies to delivered merged worktrees too (PROP-GC02)."

### S4 — Plan and round lookups read the proposals directory
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/blocked-by.ts`, `plugins/proposals/src/lib/proposals/proposal-paths.ts`, `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`, `plugins/proposals/src/lib/swarm/round-context-sources.ts`, `plugins/proposals/src/lib/tools/round-context.tool.ts`
- **Gate**: type
- acceptance:
  - "The plan-blocker lookup resolves documents under the proposals directory, not the cache directory (PROP-DOM01)."
  - "Round-context's fallback finds proposals in canonical status folders and counts both in-progress spellings (PROP-ROUND01, PROP-ROUND02)."
  - "A plan's children reach the closure guard (PROP-PLAN02): a spec proves it on the f00764 parser."

### S5 — Detail levels, loop verdicts and carried work say what happened
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/contracts/proposal-view.contract.ts`, `plugins/proposals/src/lib/tools/proposal-get.tool.ts`, `plugins/proposals/src/lib/agents/agent-loop-detector.ts`, `plugins/proposals/src/lib/agents/loop-detector-service.ts`, `plugins/proposals/src/lib/services/carried-work.service.ts`, `plugins/proposals/src/lib/services/review-identity.ts`, `packages/core/src/lib/work-units/commit-maker-notes.service.ts`
- **Gate**: type
- acceptance:
  - "proposal_get at each detail level returns a different payload, and the label matches it (PROP-DETAIL01)."
  - "A tool result with isError is never counted as a successful repeat (PROP-LOOP01)."
  - "A unit with own and adopted commits records each commit's maker, not one maker for all (G61-PROP-SVC03)."

## acceptance

- A task leased by a worker whose lease expired returns to the queue; a spec kills the worker mid-task and the task is delivered once to the next worker (D6).
- enqueue refuses past a configured cap with a typed error instead of growing without bound.
- Appending after a torn tail keeps the first good entry (PROP-JOURNAL01).
- Quarantine repair resolves a proposal-relative source against the proposals directory (G61-PROP-SVC01).
- A successful reconciliation clears the stale-reconciliation warning of earlier runs (G61-PROP-SVC02).
- The folder lint uses the nearest status-named ancestor (PROP-LINT01).
- Each case has a spec that fails on develop today.
- A worktree whose status cannot be read is kept and reported, never classified clean (PROP-GC01).
- The age limit applies to delivered merged worktrees too (PROP-GC02).
- The plan-blocker lookup resolves documents under the proposals directory, not the cache directory (PROP-DOM01).
- Round-context's fallback finds proposals in canonical status folders and counts both in-progress spellings (PROP-ROUND01, PROP-ROUND02).
- A plan's children reach the closure guard (PROP-PLAN02): a spec proves it on the f00764 parser.
- proposal_get at each detail level returns a different payload, and the label matches it (PROP-DETAIL01).
- A tool result with isError is never counted as a successful repeat (PROP-LOOP01).
- A unit with own and adopted commits records each commit's maker, not one maker for all (G61-PROP-SVC03).
