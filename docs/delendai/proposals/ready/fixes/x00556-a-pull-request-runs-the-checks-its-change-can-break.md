---
id: x00556
title: "A pull request runs the checks its change can break"
kind: fix
status: ready
type: proposal
track: efficiency
date: 2026-09-19
tags:
    - ci
    - cost
    - gates
---

# x00556 — A pull request runs the checks its change can break

## goal

A pull request pays for the gates its change can actually break, and the
integration branch keeps paying for all of them. A documentation-only
change stops costing the same as a change to the core engine, without
any gate becoming optional.

## why

Measured on 2026-09-19: every pull request in this repository runs the
full aggregate — 24 jobs, some of them the whole test matrix and 30-plus
lints — whatever it touched. A proposal that edits one markdown file and
a change that rewrites the state engine cost the same, and that cost is
paid on every push of every parallel work unit.

This is not a safety property. The integration branch is where "all
gates, always" has to hold, and it will keep holding: a pull request
that skipped an irrelevant job and a merge queue that runs everything
before landing give the same guarantee at a fraction of the cost.

The risk to avoid is the obvious one: a selection that is wrong in the
unsafe direction — skipping a job whose inputs the change did affect.
That is a question about the mapping from paths to jobs, and it is
answerable, reviewable and testable.

## non-goals

- **No gate becomes optional.** Every job still runs before anything
  lands on the integration branch.
- **No heuristics that fail open.** An unmapped path runs everything; a
  mapping that cannot be resolved runs everything. Uncertainty costs
  money, never safety.
- **No hand-maintained duplicate of the workflow.** The mapping is
  derived from what the jobs actually read, and drift from the workflow
  is a failure.

## slices

### S1 — Each job declares the paths it can be broken by

- **Status**: pending
- **Gate**: `bun run lint:workflow`
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/**`
- Every CI job carries an explicit input set. A job with no declared
  inputs always runs. A lint that fails to declare and is then skipped
  is a gate failure, not a saving.

### S2 — A pull request selects, the integration branch does not

- **Status**: pending
- **Gate**: `bun run lint:workflow`
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/**`
- On a publication ref, the changed paths select the jobs; on the
  integration branch and on the merge that lands work, the full
  aggregate runs unconditionally.

### S3 — The saving is measured, not assumed

- **Status**: pending
- **Gate**: `bun run lint:workflow`
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/**`
- The run reports which jobs were selected and which were skipped and
  why, so the selection is auditable and a wrong mapping is visible
  rather than silent.

### S4 — A change outside the workspaces reaches only the zones that read it

- **Status**: done — see the measurements below.
- **Gate**: `npx vitest run tools/scripts/ci/zone-reads.spec.ts tools/scripts/ci/test-zones`
- **Files**: `tools/scripts/lib/record-reads-setup.ts`,
  `vitest.shared.ts`,
  `tools/scripts/ci/zone-reads.ts`,
  `tools/scripts/ci/zone-reads.script.ts`,
  `tools/scripts/ci/zone-reads.spec.ts`,
  `tools/scripts/ci/zone-reads.script.spec.ts`,
  `tools/scripts/ci/zone-reads.generated.json`,
  `tools/scripts/ci/test-zones.script.ts`,
  `tools/scripts/ci/test-zones.constant.ts`,
  `tools/scripts/ci/test-zones.interface.ts`
- The module graph already selects specs inside the workspaces. It cannot
  see a spec that READS a file instead of importing it, so the zone
  planner ran every zone for any change outside a workspace. Measured on
  2026-09-24: a pull request that changed one e2e spec (#371) and a
  documentation-only one (#368) each ran all eleven shards, 3 to 5 minutes
  each.
- A setup file, inert unless `DELENDAI_RECORD_READS` is set, records
  which root files and directories each zone touches during a full run,
  and `zone-reads.generated.json` commits the result. A root change now
  reaches the zones that read it, read another file in its directory, or
  listed a directory above it. It still reaches everything when there is
  no usable map, and for any file at the repository root or under
  `.github/`.
- Measured with the first map: a proposal edit now runs core, plugins,
  proposals and tools, and skips packages and apps; a change under
  `tests/e2e`, `scripts/` or `.claude/` runs plugins and tools only. The
  plugins and tools zones walk most of the repository on purpose (lints,
  install, the agent catalogue), so they stay reachable from nearly
  everything. The gain is real but partial; narrowing it further means
  narrowing what those specs scan, not trusting the map less.
- Known limit, stated rather than hidden: the recorder sees reads in the
  test process, not in subprocesses a spec starts. The integration branch
  still runs every zone, which is where such a miss is caught, as it is
  for the module-graph filter today.

## acceptance

- A change that touches only documentation runs strictly fewer jobs than
  a change to the core engine, and the integration branch keeps running
  every job unconditionally.
- A job with no declared inputs always runs; an unmapped path runs
  everything.
- Every run reports which jobs were selected, which were skipped, and
  why.

