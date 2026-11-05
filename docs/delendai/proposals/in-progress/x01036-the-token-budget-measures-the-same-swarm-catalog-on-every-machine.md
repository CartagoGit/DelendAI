---
id: x01036
title: "The token budget measures the same swarm catalog on every machine"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-05
last-transition-id: 0697dbdf-f5f9-45d8-a676-46a36e3c6169
last-correlation-id: 0697dbdf-f5f9-45d8-a676-46a36e3c6169
last-transition-from: ready
last-transition-at: 2026-11-05T00:32:51.081Z
---

# x01036 — The token budget measures the same swarm catalog on every machine

## goal

The token budget spec boots its plugins on a module graph of its own, so the measured swarm catalog is 125 tools on every machine and in every shard; and a zone that fails still uploads the coverage it measured, so one red spec cannot make live modules look dead.

## why

Develop's own CI run 41881905780 (job 126756619095, `tests: tools 2/4`) failed `token-budget-dashboard.e2e.spec.ts > keeps the published token budget artifact aligned with the generated addendum`: CI measured the swarm preset as 106 tools, the committed TOKEN-BUDGETS.md says 125. The count was never a machine property. Replaying that shard's 122 spec files in a worktree with no `dist` (as in CI) reproduced it with 117 tools: the dashboard's load errors column read `git: could not load plugin "git" ... Cannot load plugins/git/src/lib/release/index.ts ... after the environment was torn down`. The tools project shares one module graph per worker (`isolate: false`); a module another file left there (`git.ts`) keeps its lazy `import()` bound to that file's torn-down environment, so the plugin silently fails to load and its 8 tools (or 19, or any) vanish from the measurement, depending on which files ran before in the worker. Run alone, or with a few files, the spec reads 125, which is why every local run agreed with the committed file.

That red spec cost two red jobs, not one. The zone's step that uploads its coverage blob is `if: matrix.zone.run`, so it was skipped once the step before it failed (job 126756619095, step 9 "Upload this zone's blob report -> skipped"). The merge then judged the coverage of the whole run from the shards that happened to pass, and `lint:no-dead-modules` reported `tools/scripts/lib/monorepo-paths.ts` as a module whose 20 functions and 64 branches had never run — while its own spec had run and passed inside that very shard. A red integration branch stops the queue from arming anything (`integrationAllowsArming` in `tools/scripts/forge/queue-arming.ts` returns false unless the branch is certified), so the whole queue was blocked by one spec.

## non-goals

- Regenerating TOKEN-BUDGETS.md: it is already right.
- Changing how plugins load.
- Making a failed shard green. This only carries the evidence it measured.

## slices

- global_gate: none

### S1 - A spec that boots real plugins gets a worker of its own
- **Status**: pending
- **Files**: `vitest.shared.ts`, `tools/scripts/report/token-budget-dashboard.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "A spec carrying the @delendai-isolate pragma is listed by isolatedSpecs and runs in the isolated project; the token budget e2e spec carries it and passes in the full tools 2/4 spec list with 125 swarm tools."

### S2 - A failed zone still uploads the coverage it measured
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/blob-upload-on-failure.spec.ts`
- **Gate**: none
- acceptance:
  - "The step that uploads a zone's coverage blob runs even when the zone failed, so the merge judges the run from every zone that ran; a spec reads ci.yml and says so."
  - "A zone that produced no report at all does not fail the upload: the merge already names the zone that is missing."

## acceptance

- A spec carrying the @delendai-isolate pragma is listed by isolatedSpecs and runs in the isolated project; the token budget e2e spec carries it and passes in the full tools 2/4 spec list with 125 swarm tools.
- The step that uploads a zone's coverage blob runs even when the zone failed, so the merge judges the run from every zone that ran; a spec reads ci.yml and says so.
- A zone that produced no report at all does not fail the upload: the merge already names the zone that is missing.
- One red spec in a zone leaves the integration branch's own verdict to report it, not to invent a second red job about a module that ran.
