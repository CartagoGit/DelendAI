---
id: x00557
title: "An automation that cannot finish must not report success"
kind: fix
status: review
type: proposal
shipped-in: ["36427d47b"]
track: trust
date: 2026-09-19
tags:
    - ci
    - release
    - forge
    - honesty
---

# x00557 — An automation that cannot finish must not report success

## goal

Every automated job either does what its name says or ends red with what
it could not do. A green run means the work happened.

## why

Three jobs in this repository end green while the thing they promise does
not happen. All three were found by reading the code against its own
workflow file, and all three are invisible from the run's result.

**The queue.** `keep-the-queue-moving.yml` says "the merge itself
refreshes the rest" and runs the script with `--apply`. The script
deliberately stopped refreshing anything (#99: a branch updated by the
workflow's own token produces a bot commit, the forge parks the resulting
runs as `action_required`, and the candidate becomes permanently
unmergeable with nothing red on it). That reasoning is right; what is
wrong is that the workflow still announces the old behaviour, still
passes a flag that now changes nothing, and still exits 0 having left
every candidate behind. Measured: run #216 succeeded while candidates
stayed stale.

**The release by tag.** `release.yml` offers two triggers, manual and
`vX.Y.Z` tag. `derive-version.script.ts` computes
`git log <latest-tag>..HEAD`, and when the tag being pushed IS the latest
tag that range is empty: `bump: none`, `release: false`, and every
publish step is skipped. The tag trigger is documented as a way to
publish and cannot publish.

**The forward sync.** `forward-sync-release.script.ts` opens its pull
request with `GITHUB_TOKEN`, then starts CI with
`gh workflow run ci.yml --ref <branch>`. A `workflow_dispatch` run does
not satisfy a pull request's required status checks, so the branch can
show a green run and never become mergeable — which is exactly the
mechanism meant to stop `main` and the integration branch from drifting
apart after a release.

The common shape: an automation that cannot complete its own promise
because of a forge constraint, and reports success anyway. The honest
answer is not to hide the constraint — it is to make the job's result say
what actually happened, and to move the operation that needs a real
credential to the place that has one.

## non-goals

- **No admin credential in CI.** The reason the queue stopped writing
  commits stands: a token that makes the forge build its own pushes is
  not something this repository is going to carry in a workflow.
- **No silent retries.** A job that cannot finish reports; it does not
  loop until the forge relents.
- **No change to what "green" requires.** Nothing here weakens a gate;
  it makes a job's exit code mean what a reader assumes it means.

## slices

### S1 — The queue reports honestly, and its promise matches its code

- **Status**: done — the workflow stops claiming it refreshes candidates
  and stops passing a flag the script does not read; a stuck queue ends
  non-zero, so it is visible in the run list instead of inside the log of
  a green run.
- **Files**: `.github/workflows/keep-the-queue-moving.yml`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- **Gate**: `npx vitest run tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- The job stops claiming it refreshes candidates, stops taking a flag
  that changes nothing, and ends non-zero when candidates are stale —
  so "the queue is stuck" is visible in the run list instead of inside
  the log of a green run.

### S2 — Refreshing happens where a real credential lives

- **Status**: done, and as built it lives in the host rather than in the
  hydration module the slice named. The watch already reports every pass
  through `onTick`, so the refresh hangs off that seam in
  `host-server.script.ts`: when a tick actually moves the tree — the
  moment every candidate goes stale — the owner machine refreshes them in
  the background, with its own credential, which is the whole point. A
  fast-forward is not a merge, so the post-merge hook does not cover it.
  CI only reports: `keep-the-queue-moving` names the candidates that are
  behind and says to refresh them from the machine that owns them,
  because an API call's commit is attributed to a bot and the forge will
  not start workflows on a bot's commit. Verified by reading both halves
  rather than trusting the already-implemented gate, whose signal here is
  only that the declared files predate the proposal.
- **Files**: `tools/scripts/host/host-server.script.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`,
  `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- The owner machine — which pushes with a credential the forge builds —
  refreshes stale candidates as part of hydration, which is the same
  cascade x00554 needs. CI only reports.

### S3 — A tag publishes that tag; a manual run derives the next version

- **Status**: done — `versionFromTagRef` makes a tag run publish exactly
  the version its tag names, after the workflow proves the tag points at
  the commit being built; a manual run derives the next version as
  before.
- **Files**: `.github/workflows/release.yml`,
  `tools/scripts/release/derive-version.script.ts`,
  `packages/core/tests/derive-version.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/derive-version.spec.ts`
- The two triggers stop sharing a derivation that only makes sense for
  one of them. A tag run publishes exactly the version it names, after
  proving the tag matches the commit and the content; a manual run
  derives the next version as it does today.

### S4 — A pull request opened by automation gets a check that counts

- **Status**: done — the order was the defect. `openCandidate` opened the
  pull request, **armed auto-merge, and only then** dispatched `ci.yml`;
  when the dispatch failed it refused, with the arming already done. So a
  forward-sync could sit armed behind a check that was never started —
  which is the worst possible shape, because it has no red mark and no
  pending run: it is indistinguishable from a queue that is merely slow,
  and nobody looks at it. The dispatch now happens first, and a dispatch
  that fails leaves the pull request unarmed, says auto-merge was NOT
  armed and why, and names both commands. Outside a workflow run nothing
  is dispatched, because a person's push builds on its own. Pinned by
  tests over an injected runner that assert the CALL ORDER; both fail
  against the previous order, which I checked by restoring it.
- **Files**: `tools/scripts/forge/forward-sync-release.script.ts`,
  `tools/scripts/forge/forward-sync-release.script.spec.ts`,
  `tools/scripts/forge/forward-sync-release.interface.ts`
- **Gate**: `npx vitest run tools/scripts/forge/forward-sync-release.script.spec.ts`
- The forward-sync stops relying on `workflow_dispatch` to satisfy a
  required check it cannot satisfy: it either produces a run the branch
  rule accepts, or it reports that the pull request needs a human, with
  the reason. It never arms auto-merge behind a check that will not
  arrive.

## acceptance

- A run of the queue job whose candidates are stale ends non-zero, and
  its name and description describe what it does.
- Pushing a `vX.Y.Z` tag publishes that version, and a manual run still
  derives the next one; both are covered by a test that asserts the
  publish step is reached.
- The forward-sync either produces a check the branch rule accepts, or
  ends with an explicit, recoverable error naming what is missing.
- No job in this repository exits 0 having only printed instructions.
