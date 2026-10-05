---
id: x00556
title: "A pull request runs the checks its change can break"
kind: fix
status: review
type: proposal
track: efficiency
date: 2026-09-19
tags:
    - ci
    - cost
    - gates
last-transition-id: 64730661-cf16-4a63-8fe6-706211d89466
last-correlation-id: 64730661-cf16-4a63-8fe6-706211d89466
last-transition-from: in-progress
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

- **Status**: review
- **Gate**: `bun run lint:job-scope && bun run test:sqlite:real-tree`
- **Files**:
  - `.github/workflows/ci.yml`
  - `tools/scripts/ci/job-scope.constant.ts`
  - `package.json`
- Every CI job carries an explicit input set. A job with no declared
  inputs always runs. A lint that fails to declare and is then skipped
  is a gate failure, not a saving.
- **Found 2026-09-29 — `job-scope` already declares inputs, and one of
  them made a 4-minute job run on every pull request.**
  `sqlite-cutover-ready` (the second slowest job after the test zones,
  257 s) listed `docs/delendai/proposals/`, and every pull request edits
  a proposal. Its reason said the cutover gate reads proposal statuses;
  it does not (its outstanding list is written in the script). What does
  read the real tree is one spec of the SQLite suite,
  `real-tree-projection` (3 s): a proposal edit can break it, as
  `kind: infra` once did. It now runs as `test:sqlite:real-tree` in
  `lint-governance`, on every change, and the proposal tree left the
  cutover job's inputs. A change of a proposal and a script now selects
  22 jobs instead of 23, without the slow one; a change to the SQLite
  packages still selects it.
- **Decided 2026-10-05 — the jobs declared `always` stay `always`.**
  Fifteen jobs are: the six lint groups, `plan-scope`, `quality-gate`,
  `metrics-gate`, `delendai-validate`, `ref-lifecycle`,
  `release-the-queue`, `develop-protection-live`,
  `generated-artifacts-check` and `manifests-check`. Each verifies a
  property of the whole repository, or is the aggregate the others
  report to. A lint group is a chain of dozens of scripts that scan
  docs, workflows, proposals and source alike, so its true input set is
  the repository, and a bound narrower than that is a guess. The
  asymmetry this table is built on answers it: a job run without need
  costs minutes, and a job skipped by a wrong bound ships a regression
  under a green tick. The saving that was there to take is the one S4,
  S5 and S6 took, in the test zones, where the inputs are measured. An
  explicit `always` with its reason is this slice's "declared input
  set" for these jobs.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `9d241a3dbba1`

### S2 — A pull request selects, the integration branch does not

- **Status**: done — verified 2026-10-01; it holds by construction and is
  pinned by tests on both selectors.
- **Gate**: `npx vitest run tools/scripts/ci/job-scope.script.spec.ts tools/scripts/ci/test-zones.script.spec.ts`
- **Files**:
  - `.github/workflows/ci.yml`
  - `tools/scripts/ci/job-scope.script.ts`
  - `tools/scripts/ci/test-zones.script.ts`
- On a publication ref, the changed paths select the jobs; on the
  integration branch and on the merge that lands work, the full
  aggregate runs unconditionally.
- How it holds: `plan-scope` and `plan-tests` pass `--base` only when the
  event is `pull_request`. A push to the integration or release branch, a
  `merge_group` run and a dispatch arrive with no base. With no base,
  `job-scope` gets an empty change list and runs every job
  (`jobMustRun`: "runs everything when the change list is empty"), and
  the test planner runs every zone ("runs every zone when the run has no
  base, as a dispatch or a push does"). Evidence: CI run 36607216424, a push
  to develop, planned `26/26 job(s)` and ran all 11 test zones.
- shipped-in: `1191c3a74071`

### S3 — The saving is measured, not assumed

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/ci/test-zones.script.spec.ts tools/scripts/ci/job-scope.script.spec.ts tools/scripts/lint/workflow-history-depth.script.spec.ts`
- **Files**:
  - `.github/workflows/ci.yml`
  - `tools/scripts/ci/job-scope.script.ts`
  - `tools/scripts/ci/job-scope.script.spec.ts`
  - `tools/scripts/ci/test-zones.script.ts`
  - `tools/scripts/ci/test-zones.script.spec.ts`
  - `tools/scripts/ci/zone-reads.ts`
  - `tools/scripts/lint/workflow-history-depth.constant.ts`
  - `tools/scripts/lint/workflow-history-depth.script.spec.ts`
- The run reports which jobs were selected and which were skipped and
  why, so the selection is auditable and a wrong mapping is visible
  rather than silent.
- **Found 2026-09-29 — the selection never ran in CI.** `plan-tests`
  checked out one commit, so the pull request's base was not in its
  object store, the diff threw, and the planner fell back to every zone
  without saying so. #658 (a forge script and a proposal) ran all eleven
  zone jobs; replayed with the history it skips core and packages. The
  report line the log printed was computed without the base, so it read
  "every zone" whatever happened.
- `plan-tests` now fetches the history, and the report is computed for
  the same base as the matrix. When the planner runs every zone it says
  why, once: no base (a push or a dispatch), the diff from the base
  failed, the workspace graph or the affected set could not be built, no
  zone read map, or the root file or workflow that can reach anything.
- `workflow-history-depth` did not catch it: the diff happens two
  modules below the script the job runs. A job handed the pull
  request's base (`github.event.pull_request.base.sha`) now counts as
  reading history, so a shallow planner fails the lint.
- **Done 2026-10-05 — the jobs that are not test zones say why too.**
  `plan-scope` printed `run` or `skip` beside each job and nothing
  else. `explainJobs` now gives the sentence: the changed file that
  makes a bounded job run, the bound none of the changed files is
  under when it is skipped, `declared always`, or that there is no
  change list and nothing is skipped. It is computed from the same
  table as the plan, and a spec holds the two to the same answer.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `1191c3a74071`

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
- shipped-in: `76c3529fb71e`

### S5 — An edited file reaches only the zones that read it

- **Status**: done — see the measurements below.
- **Gate**: `npx vitest run tools/scripts/ci/zone-reads.spec.ts tools/scripts/ci/zone-reads.script.spec.ts tools/scripts/ci/test-zones.script.spec.ts`
- **Files**:
  - `tools/scripts/ci/zone-reads.ts`
  - `tools/scripts/ci/zone-reads.script.ts`
  - `tools/scripts/ci/zone-reads.generated.json`
  - `tools/scripts/ci/test-zones.script.ts`
  - `tools/scripts/ci/test-zones.interface.ts`
  - `tools/scripts/ci/affected.script.ts`
  - `tools/scripts/ci/zone-reads.spec.ts`
  - `tools/scripts/ci/zone-reads.script.spec.ts`
  - `tools/scripts/ci/test-zones.script.spec.ts`
  - `tools/tests/ci/affected.spec.ts`
  - `tools/scripts/migrate/rebrand-propagate.script.ts`
- S4 sent a changed root file to every zone that had listed ANY directory
  above it. Listing a directory depends on which files it holds, not on
  what they say, and `core`, `plugins` and `tools` list `docs/` and
  `tools/`: #648 (two lint scripts, their specs and a proposal moved to
  review) ran all eleven shards on 2026-09-29.
- The map now records the root FILES each zone read, not their
  directories. An edited file reaches the zones that read it; a file added
  or deleted also reaches the zones that listed its own directory; a file
  under a zone's own paths (`tests/e2e`, `scripts/`, …) reaches that zone.
  The diff is `base...head` with `--name-status --no-renames`, so a rename
  is a deletion and an addition, and a candidate behind its base does not
  count the base's later changes as its own.
- The planner prints, per zone, whether it runs and why (S3's report, for
  the test matrix).
- Re-recorded on 2026-09-29: apps reads 2 root files, core 11, packages 5,
  plugins 19, proposals 1,144, tools 51. #648 replayed against it runs
  proposals, plugins, apps and tools, and skips core and packages; a
  proposal edit that moves nothing runs proposals alone.
- The file-level map names the proposals a zone read, pre-rebrand audits
  included, and the rebrand sweep read those file names as live uses of
  the retired name: `develop` went red on it after the merge (#650). The
  map joins the baselines the sweep already skips for the same reason.
- shipped-in: `c2cff78d39b7`

### S6 — A zone that scans other workspaces is reached by their changes

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/ci/test-zones.script.spec.ts`
- **Files**:
  - `tools/scripts/ci/test-zones.script.ts`
  - `tools/scripts/ci/test-zones.constant.ts`
  - `tools/scripts/ci/test-zones.interface.ts`
  - `tools/scripts/ci/test-zones.script.spec.ts`
- **Found 2026-10-05 — a pull request was green and the integration branch
  went red on its next full run.** A plugin wrote a file with its own
  `writeFile` and `rename`. A core spec walks every plugin's source for
  exactly that, and fails on it. The pull request changed only the plugin,
  nothing in core imports the plugin, so the module graph selected the
  `plugins` zone and not `core`: the spec never ran. On `develop` every
  zone runs, the spec failed, and the queue armed nothing for seven hours.
- A zone rule may declare `scans`: the sources of other workspaces its
  specs read from disk. A change to a path it scans selects the zone,
  whatever the graph says. `core` declares `plugins/`, `packages/`, `apps/`
  and `extensions/`: ten of its specs walk those trees.
- This costs two more shards on a pull request that changes a plugin and
  nothing else. It is the price of specs that judge other workspaces from
  where they live; moving them next to what they judge would remove it.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b7d8e2c7a084`

## acceptance

- A change that touches only documentation runs strictly fewer jobs than
  a change to the core engine, and the integration branch keeps running
  every job unconditionally.
- A job with no declared inputs always runs; an unmapped path runs
  everything.
- Every run reports which jobs were selected, which were skipped, and
  why.

