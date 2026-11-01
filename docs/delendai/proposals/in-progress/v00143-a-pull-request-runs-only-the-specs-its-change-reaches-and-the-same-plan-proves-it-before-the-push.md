---
id: v00143
title: "A pull request runs only the specs its change reaches, and the same plan proves it before the push"
kind: perf
status: in-progress
type: proposal
track: ci
date: 2026-10-28
last-transition-id: 6d012089-6aef-491a-b276-1125fb5baff3
last-correlation-id: 6d012089-6aef-491a-b276-1125fb5baff3
last-transition-from: ready
last-transition-at: 2026-11-01T13:23:23.902Z
---

# v00143 — A pull request runs only the specs its change reaches, and the same plan proves it before the push

## goal

A pull request starts a test job only for a spec its change can break — by import or by a file the spec reads — and runs exactly those specs; a change that reaches none starts none. The plan CI follows is the one an agent runs before pushing, so a push is known good before the forge sees it.

## why

Measured on 2026-10-28 on #1552, a pull request that moves one proposal file from `in-progress/` to `review/`:

- The zone planner sent it to `proposals` (2 jobs), `plugins` (4 jobs, 726 specs) and `tools` (4 jobs, 325 specs): the committed read map (`zone-reads.generated.json`) is per zone, and the plugins and tools zones list 118 directories each, the proposal folders among them, because some spec in each zone lists them.
- Each of those jobs then ran `vitest --changed <base>`, which selects a spec only when its imports reach a changed file. `tests: plugins 1/4` printed "No test files found" after 38 s of setup and 1 min 44 s of collecting: the specs that read the proposals, the reason the job started, were not run at all. The pull request was both slow and blind to what it could break; develop's full run found such breaks after the merge.
- 38 jobs ran (2,511 job-seconds, CodeQL 312 s and lint-security 175 s among them) for one moved Markdown file. One-file documentation pull requests took 10 to 24 hours from opening to merge that day.
- My local gate before publishing repeated the whole of CI instead of the plan, about 45 minutes a unit; the forge then repeated it again.

## non-goals

- Dropping a check from develop's full run, which still runs every zone.
- Changing which checks are required.

## slices

- global_gate: type

### S1 — The read map says which spec read what
- **Status**: pending
- **Files**: `tools/scripts/lib/record-reads-setup.ts`, `tools/scripts/ci/zone-reads.script.ts`, `tools/scripts/ci/zone-reads.script.spec.ts`, `tools/scripts/ci/test-zones.interface.ts`, `tools/scripts/ci/zone-reads.generated.json`, `biome.json`
- **Gate**: type
- acceptance:
  - "The recorder writes each read with the spec that made it (`expect.getState().testPath`), and the committed map holds, per zone, the specs and the files and directories each read, next to the zone totals it holds today."

### S2 — A job runs the specs the change reaches, or does not start
- **Status**: pending
- **Files**: `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "For a change outside every workspace, a zone's jobs receive the list of its specs that read or list a changed path and run exactly those; with none, the zone does not start (the move of one proposal, #1552's change, starts 4 jobs running the 6 specs that read it instead of 12 jobs running none)."
  - "A change inside a workspace still runs `--changed` for the specs its imports reach, plus the listed readers of any changed root file."

### S3 — The push is proved by the same plan
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.interface.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`bun run prove` plans the change against the integration branch exactly as CI does and runs the selected specs, the lints CI runs for the touched kinds of file, and the typecheck; it prints the plan, the time of each step and the verdict."

### S4 — Documentation-only changes skip the code analyses
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`
- **Gate**: type
- acceptance:
  - "A pull request that changes only Markdown under docs/ reports CodeQL, lint-security, verify-runtime, pack smoke and the web build as passed without running them (a required check still reports), and runs the proposal and documentation lints."

## acceptance

- The recorder writes each read with the spec that made it (`expect.getState().testPath`), and the committed map holds, per zone, the specs and the files and directories each read, next to the zone totals it holds today.
- For a change outside every workspace, a zone's jobs receive the list of its specs that read or list a changed path and run exactly those; with none, the zone does not start (the move of one proposal, #1552's change, starts 4 jobs running the 6 specs that read it instead of 12 jobs running none).
- A change inside a workspace still runs `--changed` for the specs its imports reach, plus the listed readers of any changed root file.
- `bun run prove` plans the change against the integration branch exactly as CI does and runs the selected specs, the lints CI runs for the touched kinds of file, and the typecheck; it prints the plan, the time of each step and the verdict.
- A pull request that changes only Markdown under docs/ reports CodeQL, lint-security, verify-runtime, pack smoke and the web build as passed without running them (a required check still reports), and runs the proposal and documentation lints.
