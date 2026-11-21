---
id: x01123
title: "Work-unit entry hints and authoring stay inside their own unit, and a mocked module in a non-isolated zone is refused where it is written"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-21
last-transition-id: fa1e6c01-ff74-4ea1-bcb3-bf339a6a3a19
last-correlation-id: fa1e6c01-ff74-4ea1-bcb3-bf339a6a3a19
last-transition-from: in-progress
last-transition-at: 2026-11-21T09:58:21.861Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-generation.service.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-unit-generation.service.e2e.spec.ts: the refusal for a live lease of a different session names the holder's worktree path with 'run this again from inside' and no longer asks for --session."
  - "work-unit-generation.service.e2e.spec.ts: a dead same-agent session's lease is released once its heartbeat is quiet for leaseTtlMinutes (no pid exists to key on): chooseGeneration given that ref as quiet takes the generation; without it, the holder is still refused."
- shipped-in: `022f61fa0d82`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — vi.mock is refused in zones whose vitest config sets isolate:false
- **Status**: review
- **Files**: `new:tools/scripts/lint/vitest-no-mock-without-isolation.script.ts`, `new:tools/scripts/lint/vitest-no-mock-without-isolation.script.spec.ts`, `new:tools/scripts/lint/vitest-no-mock-without-isolation.baseline.json`, `package.json`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "vitest-no-mock-without-isolation.script.spec.ts: a spec under a zone whose vitest config has isolate:false and that calls vi.mock is reported with a pointer to dependency injection; the same call in an isolating zone, and vi.spyOn, are not."
- shipped-in: `34e2027156cc`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — proposals create refuses a cwd that is another unit's worktree or targets its own create unit
- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`, `plugins/proposals/tests/src/lib/tools/authoring/create-proposal.tool.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "create-proposal.tool.spec.ts: called with a checkout that is the worktree of a non-create unit, the tool refuses naming that unit and writes nothing; called from a create unit it writes there."
- shipped-in: `e3ba0ba2658a`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- work-unit-generation.service.spec.ts: the refusal for a live lease of a different session names the holder's worktree path with 'run it from inside' and no longer asks for --session.
- work-unit-generation.service.spec.ts: entering a slice whose lease is held by a same-agent session with ownerAlive=false takes the lease over; a live holder is still refused.
- vitest-no-mock-without-isolation.script.spec.ts: a spec under a zone whose vitest config has isolate:false and that calls vi.mock is reported with a pointer to dependency injection; the same call in an isolating zone, and vi.spyOn, are not.
- create-proposal.tool.spec.ts: called with a checkout that is the worktree of a non-create unit, the tool refuses naming that unit and writes nothing; called from a create unit it writes there.
