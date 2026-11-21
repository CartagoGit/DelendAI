---
id: x01123
title: "Work-unit entry hints and authoring stay inside their own unit, and a mocked module in a non-isolated zone is refused where it is written"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: c8c237c1-9713-4d88-bede-bec603bde285
last-correlation-id: c8c237c1-9713-4d88-bede-bec603bde285
last-transition-from: ready
last-transition-at: 2026-11-21T07:28:20.760Z
---

# x01123 — Work-unit entry hints and authoring stay inside their own unit, and a mocked module in a non-isolated zone is refused where it is written

## goal

Four workflow defects found on 2026-11-21 are fixed at their roots: the lease hint names a path instead of a session the agent never saw, a dead same-agent lease no longer refuses re-entry, `proposals create` never writes into another unit, and `vi.mock` is refused in zones that run without per-file isolation.

## why

(a) `work enter --print-path` does not print the session, yet the refusal in packages/core/src/lib/work-units/work-unit-generation.service.ts asks for it; withSessionOfCwd in work-unit-shared.service.ts already resolves the session when run from inside the unit's worktree, so the hint should say so. (b) plugins/proposals/vitest.config.ts sets isolate:false, where vi.mock of a module other files import has no effect and no warning; #3391 failed in CI and passed alone. v00139 resets module state for that zone but adds no check against vi.mock. (c) `proposals create` writes into whatever unit the cwd is in: it landed as stray commit 2905f49ea in x01109-S1. (d) A lease whose owner is dead (ownerAlive=false) of the same agent still refuses re-entry with the live-lease refusal. Checked docs/delendai/proposals: x00831 (a slice held by another agent) and v00139 are adjacent; none covers these four.

## non-goals

- Making vi.mock work in isolate:false zones
- Changing how a live lease is judged

## slices

- global_gate: none

### S1 — A lease refusal names the worktree to run from, and a quiet same-agent lease is released
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-generation.service.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-unit-generation.service.e2e.spec.ts: the refusal for a live lease of a different session names the holder's worktree path with 'run this again from inside' and no longer asks for --session."
  - "work-unit-generation.service.e2e.spec.ts: a dead same-agent session's lease is released once its heartbeat is quiet for leaseTtlMinutes (no pid exists to key on): chooseGeneration given that ref as quiet takes the generation; without it, the holder is still refused."

### S2 — vi.mock is refused in zones whose vitest config sets isolate:false
- **Status**: pending
- **Files**: `new:tools/scripts/lint/vitest-no-mock-without-isolation.script.ts`, `new:tools/scripts/lint/vitest-no-mock-without-isolation.script.spec.ts`, `plugins/proposals/vitest.config.ts`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "vitest-no-mock-without-isolation.script.spec.ts: a spec under a zone whose vitest config has isolate:false and that calls vi.mock is reported with a pointer to dependency injection; the same call in an isolating zone, and vi.spyOn, are not."

### S3 — proposals create refuses a cwd that is another unit's worktree or targets its own create unit
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`, `plugins/proposals/tests/src/lib/tools/authoring/create-proposal.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/authoring/create-proposal.tool.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "create-proposal.tool.spec.ts: called with a checkout that is the worktree of a non-create unit, the tool refuses naming that unit and writes nothing; create-proposal.tool.e2e.spec.ts: called from a create unit it writes there."

## acceptance

- work-unit-generation.service.spec.ts: the refusal for a live lease of a different session names the holder's worktree path with 'run it from inside' and no longer asks for --session.
- work-unit-generation.service.spec.ts: entering a slice whose lease is held by a same-agent session with ownerAlive=false takes the lease over; a live holder is still refused.
- vitest-no-mock-without-isolation.script.spec.ts: a spec under a zone whose vitest config has isolate:false and that calls vi.mock is reported with a pointer to dependency injection; the same call in an isolating zone, and vi.spyOn, are not.
- create-proposal.tool.spec.ts: called with a checkout that is the worktree of a non-create unit, the tool refuses naming that unit and writes nothing; called from a create unit it writes there.
