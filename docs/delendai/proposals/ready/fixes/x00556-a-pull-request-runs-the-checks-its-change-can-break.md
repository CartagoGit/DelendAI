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

## acceptance

- A change that touches only documentation runs strictly fewer jobs than
  a change to the core engine, and the integration branch keeps running
  every job unconditionally.
- A job with no declared inputs always runs; an unmapped path runs
  everything.
- Every run reports which jobs were selected, which were skipped, and
  why.

