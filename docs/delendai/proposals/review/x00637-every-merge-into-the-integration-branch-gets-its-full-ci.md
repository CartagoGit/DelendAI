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

### S3 — The queue waits for a certified integration branch

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/certify-integration.script.spec.ts tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- **Files**: `tools/scripts/forge/certify-integration.script.ts`,
  `tools/scripts/forge/certify-integration.interface.ts`,
  `tools/scripts/forge/certify-integration.script.spec.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`

Asked for by the external review of 2026-09-24. The full run happens
after a commit lands, so without a gate the queue could land B while
A's full run was still going, and build on an integration branch that
turns out red. `certificationOf` says where the tip stands — certified
only by a finished green push or dispatched run — and the queue arms
nothing, and disarms its head, until the tip is certified. A red
integration branch stops the line; landing a fix on it is then the
owner's call, which delendai does not limit.

### S5 — No git maintenance outlives the test that caused it

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/lib/quiet-git-setup.spec.ts`
- **Files**: `tools/scripts/lib/quiet-git-setup.ts`,
  `tools/scripts/lib/quiet-git-setup.spec.ts`, `vitest.shared.ts`

develop's full run at `309bbe59d` (2026-09-24) went red on
`ENOTEMPTY … rmdir '/tmp/commit-policy-work-ref-remote-…/info'` and the
queue stopped, as S3 intends. The spec had pushed into a throwaway bare
remote and deleted it; since git 2.47 the maintenance a push triggers
on the receiving side detaches by default and outlived the push. CI
runs git 2.55; it did not reproduce in 15 local runs on git 2.34, where
that maintenance runs in the foreground. A shared setup file now gives
every git a test spawns no auto-gc and no auto-maintenance
(`GIT_CONFIG_*`, appended and applied once), so the process that raced
the delete is never started.

## acceptance

- After a bot merge, the new tip of `develop` gets a full CI run within
  one hydration, and that run executes every zone.
- An integration branch whose tip has no green full run arms nothing:
  the queue waits while it runs and stops while it is red.
- x00556 does not ship proportional pull-request CI without this.
