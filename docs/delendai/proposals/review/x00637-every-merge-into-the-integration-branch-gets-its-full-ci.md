---
id: x00637
title: "Every merge into the integration branch gets its full CI"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-24
---

# x00637 — Every merge into the integration branch gets its full CI

## goal

Each commit that lands on the integration branch has a full CI run of
its own, whoever merged it.

## why

Asked for by an external review on 2026-09-24, before x00556 makes pull
request CI proportional. `ci.yml` calls the integration branch the full
validation boundary: a pull request may run only what its change can
reach because the push to `develop` runs everything. Measured the same
day: the six latest merges into `develop` were made by
`github-actions[bot]` (the queue arms auto-merge with the workflow token)
and none of them had any CI run, because the forge starts no workflow
for an event the workflow token caused. The boundary x00556 relies on
did not exist.

## why this design

- The only actor that reacts to every merge with a credential the forge
  honours is the owner machine, which already runs after each merge it
  pulls (x00636). Its first step is now `certify-integration`: when the
  integration branch's tip has no push or dispatched run of `ci.yml`, it
  dispatches one. A dispatched run takes the full matrix (only
  `pull_request` runs select by change).
- A pull-request run never counts: it may have run only part.

## non-goals

- Changing who merges. Moving arming to the owner credential would also
  start push workflows, but it would put the owner machine on the path
  of every merge, including when nothing else changed.

## Slices

- global_gate: none

### S1 — The owner machine certifies what landed

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/certify-integration.script.spec.ts`
- **Files**: `tools/scripts/forge/certify-integration.script.ts`,
  `tools/scripts/forge/certify-integration.interface.ts`,
  `tools/scripts/forge/certify-integration.script.spec.ts`,
  `tools/scripts/git/hydrate-candidates-after-merge.script.ts`,
  `tools/scripts/git/hydrate-candidates-after-merge.script.spec.ts`

### S2 — A run without a pull-request base runs every zone

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/ci/test-zones.script.spec.ts`
- **Files**: `tools/scripts/ci/test-zones.script.ts`,
  `tools/scripts/ci/test-zones.script.spec.ts`,
  `.github/workflows/ci.yml`

The first run S1 dispatched (develop at `3e49b0cb5`, 2026-09-24) passed
every shard without running a test in any of them. The planner got
`--base=` with nothing after it, took the empty string as a base,
diffed nothing and marked all eleven zones `skipped`. The merge job then
failed on a missing report directory, which was the only sign anything
was wrong. A push had the same hole in a milder form: it passed
`event.before`, so the integration branch's run was filtered to what the
merge touched, although the workflow says a push keeps the full matrix.
Now only a pull request's base is passed, and an empty base means every
zone.

## acceptance

- After a bot merge, the new tip of `develop` gets a full CI run within
  one hydration, and that run executes every zone.
- x00556 does not ship proportional pull-request CI without this.
