---
id: q00038
title: "Plan: every check runs only for what the change can affect"
kind: plan
status: in-progress
type: proposal
track: ci
date: 2026-11-02
last-transition-id: d07bbe3f-f7e8-4d27-a170-4bb71f44eb27
last-correlation-id: d07bbe3f-f7e8-4d27-a170-4bb71f44eb27
last-transition-from: ready
last-transition-at: 2026-11-02T08:27:41.982Z
---

# q00038 — Plan: every check runs only for what the change can affect

## goal

A pull request and a local proof run the tests, lints and types its change can affect, chosen by a dependency analysis that follows symbols and learns what each check reads, so nothing unchanged is checked again and nothing affected is missed.

## why

The owner asked several times that a pull request check only what its change can affect, and the forge did not. Measured on 2026-11-02:

- Tests chose by module. `vitest --changed` follows imports, and nearly every spec imports a barrel that imports everything: one change in core reached 1,362 of 2,407 specs, and `vitest related` took about four minutes to say so.
- Lints ran whole in every pull request, one job per family, whatever changed.
- The local proof used a third answer, a grep for importers, so what passed locally was not what the forge ran.

Followed by symbol, the same core change reaches 240 specs, found in under a second. Over the last 14 merged pull requests the analysis picks between 0 and 503 specs. A mutation of `toolError` passed in all 55 sampled specs the analysis leaves out and failed in the ones it picks.

## non-goals

- Dropping the full run on develop: it stays the net for what an analysis cannot see.
- A list kept by hand of what a check reads: it is derived, or measured.
- Making a check weaker to make it faster.

## slices

- global_gate: type

### S1 — Tests run what the change reaches, by symbol
- **Status**: pending
- **Files**: `tools/scripts/ci/affected-specs.service.ts`, `tools/scripts/ci/affected-specs.interface.ts`, `tools/scripts/ci/affected-specs.service.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/near-specs.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "A pull request's test jobs run the specs its change reaches, followed by symbol through barrels, and by module from a changed file that runs code when it loads."
  - "A zone the change reaches no spec of starts no job."
  - "The local proof runs the same specs the forge would, from the same analysis."

### S2 — Lint jobs share their setup
- **Status**: pending
- **Files**: `tools/scripts/lint/run-together.script.ts`
- **Gate**: type
- acceptance:
  - "The lint jobs run in fewer runners, each lint family together, so a pull request stops paying a checkout and an install per family; no lint is dropped and every failure is still named."

### S3 — Types are checked incrementally
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "The typecheck reuses the integration branch's incremental state, so a change pays for what it touches."

### S4 — The saving is measured
- **Status**: pending
- **Files**: `tools/scripts/ci/test-zones.script.ts`
- **Gate**: type
- acceptance:
  - "Runner minutes and wall time per pull request are reported before and after each slice."

## acceptance

- A pull request's test jobs run the specs its change reaches, followed by symbol through barrels, and by module from a changed file that runs code when it loads.
- A zone the change reaches no spec of starts no job.
- The local proof runs the same specs the forge would, from the same analysis.
- The lint jobs run in fewer runners, each lint family together, so a pull request stops paying a checkout and an install per family; no lint is dropped and every failure is still named.
- The typecheck reuses the integration branch's incremental state, so a change pays for what it touches.
- Runner minutes and wall time per pull request are reported before and after each slice.

## notes
- 2026-11-02, S2 measured before building: recording what the 47 architecture lints read showed 26 of them call `git` (mostly `ls-files`), which reads the whole tree. Over the last 14 merged pull requests a per-lint selection would still run 31 to 43 of 47, and the lints already run together in 9 s, so the saving would be seconds for a recorder in every bun process. S2 is changed to what does cost: each lint job pays its own checkout and install, about 20 s each.
