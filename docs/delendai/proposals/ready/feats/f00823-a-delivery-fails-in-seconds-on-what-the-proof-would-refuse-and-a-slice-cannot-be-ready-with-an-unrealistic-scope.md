---
id: f00823
title: "A delivery fails in seconds on what the proof would refuse, and a slice cannot be ready with an unrealistic scope"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-18
---

# f00823 — A delivery fails in seconds on what the proof would refuse, and a slice cannot be ready with an unrealistic scope

## goal

`work deliver` refuses in seconds, before it takes the compute slot, whatever the proof would refuse and a static scoped check can know; proposal readiness refuses slices whose scope cannot match reality; `delendai kpis` shows where delivery time is lost per slice.

## why

On 2026-11-18, 92 PRs merged with p50 12 min open-to-merge but p90 about 3 h. The time went into repeated `work deliver` proofs (3-15 min each, serialised by the compute slot) that failed on checks knowable in seconds: the unit-tier 200 ms budget (f00808 S9b/c/d), changed-file coverage counted only via mirror unit specs (f00808 S9e, twice), the types-in-contracts and file-size hooks (q00046 S5/S5c) and lint-governance readiness (x01097). Slices whose Files did not match reality (q00046 S5 named 1 file for about 40, f00808 S9 named a missing file) forced mid-implementation splits, and x01097 needed 4 rounds because its specs passed on fakes while the real command failed.

## non-goals

- Replacing the full proof: the pre-check only refuses earlier, it never certifies a delivery.
- Changing what any gate accepts: the pre-check reuses the prove-plan gate definitions and messages.
- A new metrics store: kpis reads the deliver logs and records that already exist.

## slices

- global_gate: lint

### S1 — Deliver pre-check on changed files before the compute slot
- **Status**: pending
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `new:packages/cli/src/lib/work-deliver-precheck.service.ts`, `new:packages/cli/src/lib/work-deliver-precheck.service.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.interface.ts`
- **Gate**: lint
- **Decisions**: The pre-check runs the static gates the prove plan declares (lint presets incl. types-in-contracts and file-size, test budget names and tier, mirror spec presence, biome on changed files, proposal readiness and hygiene when a proposal changed) scoped to changed files, and takes its gate list from the prove-plan definitions: one source, no second list. It refuses with the same messages the proof gives and runs before the compute slot is taken.
- acceptance:
  - "packages/cli/src/lib/work-deliver-precheck.service.spec.ts: a candidate with an over-budget unit spec, a missing mirror spec, a types-in-contracts breach and a file over the size limit is refused with the proof's own messages and the compute slot is never requested"
  - "packages/cli/src/lib/work-deliver.service.spec.ts: a clean candidate passes the pre-check and proceeds to the slot"
  - "tools/scripts/ci/prove-plan.script.spec.ts: the pre-check gate list equals the plan's static gates for the same changed files"
  - "`delendai work deliver` on a candidate with a known lint breach exits non-zero in under 30 seconds without starting the proof"

### S2 — Changed-file coverage pre-check with mirror specs only
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/changed-file-coverage.script.ts`, `tools/scripts/ci/changed-file-coverage.interface.ts`, `new:packages/cli/src/lib/work-deliver-coverage-precheck.service.ts`, `new:packages/cli/src/lib/work-deliver-coverage-precheck.service.spec.ts`
- **Gate**: lint
- **Decisions**: The fast path runs only the mirror unit specs of the changed modules, with coverage collected on only those files, using the same counting rule as the coverage gate (only mirror-named specs count); it runs after the S1 static pre-check and before the slot.
- acceptance:
  - "packages/cli/src/lib/work-deliver-coverage-precheck.service.spec.ts: a changed module whose only coverage comes from a non-mirror spec is refused with the coverage gate's message"
  - "tools/scripts/ci/changed-file-coverage.script.spec.ts: the fast path and the gate agree on the same fixture"
  - "`delendai work deliver` on a changed module without a mirror spec refuses in under 60 seconds"

### S3 — Readiness refuses slices with an unrealistic scope
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-readiness.ts`, `plugins/proposals/src/lib/proposals/proposal-readiness-slices.ts`, `plugins/proposals/src/lib/contracts/interfaces/proposal-readiness.interface.ts`, `tools/scripts/lint/proposal-readiness.spec.ts`
- **Gate**: lint
- **Decisions**: Three new refusals: a slice whose non-`new:` Files do not exist in the tree; a slice that deletes a module without listing the files importing its exports (found by git grep of the exports); a CLI-behaviour slice whose acceptance has no line that runs a real command. Existing baselines are not widened.
- acceptance:
  - "tools/scripts/lint/proposal-readiness.spec.ts: a missing non-new file is refused naming it"
  - "tools/scripts/lint/proposal-readiness.spec.ts: a deletion slice that omits an importer is refused naming the importer"
  - "tools/scripts/lint/proposal-readiness.spec.ts: a CLI-behaviour slice whose acceptance has no real command run is refused"
  - "`bun run lint:proposal-readiness` exits 0 on the current tree"

### S4 — kpis reports deliver attempts and time lost per gate
- **Status**: pending
- **Files**: `packages/cli/src/commands/kpis.command.ts`, `packages/cli/src/commands/kpis-options.ts`, `packages/cli/src/commands/kpis-renderer.ts`, `packages/cli/src/commands/kpis.command.spec.ts`, `new:packages/cli/src/commands/kpis-deliver.ts`, `new:packages/cli/src/commands/kpis-deliver.spec.ts`
- **Gate**: lint
- **Decisions**: kpis reads the existing deliver logs and records and reports per slice: the number of deliver attempts, minutes from enter to PR, and minutes lost per failing gate; no new store is written.
- acceptance:
  - "packages/cli/src/commands/kpis-deliver.spec.ts: a fixture with three attempts, two failing on distinct gates, reports 3 attempts, the enter-to-PR minutes and the minutes lost per gate"
  - "packages/cli/src/commands/kpis.command.spec.ts: the per-slice delivery section is rendered"
  - "`delendai kpis` in this repository prints the per-slice delivery section"

## acceptance

- packages/cli/src/lib/work-deliver-precheck.service.spec.ts: a candidate with an over-budget unit spec, a missing mirror spec, a types-in-contracts breach and a file over the size limit is refused with the proof's own messages and the compute slot is never requested
- packages/cli/src/lib/work-deliver.service.spec.ts: a clean candidate passes the pre-check and proceeds to the slot
- tools/scripts/ci/prove-plan.script.spec.ts: the pre-check gate list equals the plan's static gates for the same changed files
- `delendai work deliver` on a candidate with a known lint breach exits non-zero in under 30 seconds without starting the proof
- packages/cli/src/lib/work-deliver-coverage-precheck.service.spec.ts: a changed module whose only coverage comes from a non-mirror spec is refused with the coverage gate's message
- tools/scripts/ci/changed-file-coverage.script.spec.ts: the fast path and the gate agree on the same fixture
- `delendai work deliver` on a changed module without a mirror spec refuses in under 60 seconds
- tools/scripts/lint/proposal-readiness.spec.ts: a missing non-new file is refused naming it
- tools/scripts/lint/proposal-readiness.spec.ts: a deletion slice that omits an importer is refused naming the importer
- tools/scripts/lint/proposal-readiness.spec.ts: a CLI-behaviour slice whose acceptance has no real command run is refused
- `bun run lint:proposal-readiness` exits 0 on the current tree
- packages/cli/src/commands/kpis-deliver.spec.ts: a fixture with three attempts, two failing on distinct gates, reports 3 attempts, the enter-to-PR minutes and the minutes lost per gate
- packages/cli/src/commands/kpis.command.spec.ts: the per-slice delivery section is rendered
- `delendai kpis` in this repository prints the per-slice delivery section
