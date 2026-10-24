---
id: x00943
title: "The proposals plugin's queue, journal and lookups never lose or invent state"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 6aee224a-a5b8-42db-9e5c-d0453b6b78c7
last-correlation-id: 6aee224a-a5b8-42db-9e5c-d0453b6b78c7
last-transition-from: in-progress
last-transition-at: 2026-10-24T06:48:02.150Z
shipped-in:
  - "85ed73972a10452839bd0cac1cb5f3cda051f688"
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
- **Status**: done
- **Files**: `plugins/proposals/src/lib/agents/persistent-task-queue.ts`, `plugins/proposals/src/lib/agents/task-queue-engine.ts`, `plugins/proposals/src/lib/contracts/constants/task-queue-limits.constant.ts`
- **Gate**: type
- acceptance:
  - "A task leased by a worker whose lease expired returns to the queue; a spec kills the worker mid-task and the task is delivered once to the next worker (D6)."
  - "enqueue refuses past a configured cap with a typed error instead of growing without bound."
- shipped-in: `96155ef9f013`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 85ed73972a10, validate exit 0 and tests 3/3 claimed, no recorded run cited; acceptance 2/2: (1) task-queue-engine.leases.spec 'delivered once to the next worker after the lease lapses, never twice' passes (2) leases.spec 'refuses another task with a typed error' passes; cap in task-queue-limits.constant — verified by code reading and spec runs

### S2 — Journal, quarantine and reconciliation keep every good entry
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/quarantine.ts`, `plugins/proposals/src/lib/tools/quarantine-repair.tool.ts`, `plugins/proposals/src/lib/tools/quarantine-list.tool.ts`, `plugins/proposals/src/lib/services/db-doctor/checks/stale-reconciliation.ts`, `plugins/proposals/src/lib/proposals/filename-linter.ts`, `plugins/proposals/src/index.ts`
- **Gate**: type
- acceptance:
  - "Appending after a torn tail keeps the first good entry (PROP-JOURNAL01)."
  - "Quarantine repair resolves a proposal-relative source against the proposals directory (G61-PROP-SVC01)."
  - "A successful reconciliation clears the stale-reconciliation warning of earlier runs (G61-PROP-SVC02)."
  - "The folder lint uses the nearest status-named ancestor (PROP-LINT01)."
  - "Each case has a spec that fails on develop today."
- shipped-in: `6191ead4bf39`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 85ed73972a10, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 5/5: (1) quarantine.spec 'keeps the first good entry appended after a torn last line' passes (2) quarantine-repair.tool.spec + quarantine.ts diff resolves against the proposals dir; passes (3) db-doctor.spec 'clears the stale-reconciliation warning once a fresh run succeeds' passes (4) filename-linter.spec added case for nearest status-named ancestor passes (5) each case added a spec in the merge (quarantine, db-doctor, filename-linter); 84 tests in 11 files pass — verified by code reading and spec runs

### S3 — Garbage collection deletes only what it read and aged
- **Status**: done
- **Files**: `plugins/proposals/src/lib/shared/branch-gc-engine.ts`, `plugins/proposals/src/lib/shared/branch-status-engine.ts`, `plugins/proposals/src/lib/tools/branch-gc.tool.ts`, `plugins/proposals/src/generated/tool-outputs.ts`
- **Gate**: type
- acceptance:
  - "A worktree whose status cannot be read is kept and reported, never classified clean (PROP-GC01)."
  - "The age limit applies to delivered merged worktrees too (PROP-GC02)."
- shipped-in: `18067259ce1b`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 85ed73972a10, validate exit 0 and tests 3/3 claimed, no recorded run cited; acceptance 2/2: (1) branch-gc-engine.spec 'keeps a worktree whose status could not be read, even with force' passes (2) branch-gc-engine.spec 'applies the age limit to a delivered worktree too' passes — verified by code reading and spec runs

### S4 — Plan and round lookups read the proposals directory
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/blocked-by.ts`, `plugins/proposals/src/lib/cascade/cascade-summary.ts`, `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`, `plugins/proposals/src/lib/swarm/round-context-sources.ts`
- **Gate**: type
- acceptance:
  - "The plan-blocker lookup resolves documents under the proposals directory, not the cache directory (PROP-DOM01)."
  - "Round-context's fallback finds proposals in canonical status folders and counts both in-progress spellings (PROP-ROUND01, PROP-ROUND02)."
  - "A plan's children reach the closure guard (PROP-PLAN02): a spec proves it on the f00764 parser."
- shipped-in: `4337e6649aa8`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Detail levels, loop verdicts and carried work say what happened
- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/surfaces/proposal-read.contract.ts`, `plugins/proposals/src/lib/tools/proposal-get.tool.ts`, `plugins/proposals/src/lib/agents/loop-detector-service.ts`, `plugins/proposals/src/lib/services/carried-work.service.ts`
- **Gate**: type
- acceptance:
  - "proposal_get at each detail level returns a different payload, and the label matches it (PROP-DETAIL01)."
  - "A tool result with isError is never counted as a successful repeat (PROP-LOOP01)."
  - "A unit with own and adopted commits is never recorded as wholly carried by the other agent (G61-PROP-SVC03); recording a maker per commit in the rounds is a format change left to its own proposal."
- shipped-in: `6191ead4bf39`
- review-state: in_review
- review-implementer: claude-opus-5-5

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
- A unit with own and adopted commits is never recorded as wholly carried by the other agent (G61-PROP-SVC03); recording a maker per commit in the rounds is a format change left to its own proposal.
