---
id: x00557
title: "An automation that cannot finish must not report success"
kind: fix
status: review
type: proposal
shipped-in:
  - 36427d47b
  - 702e6f88fa9d31cdcc897b2b64de6947061e43cb
  - acf7d4dc129d3b703d713ffc648dabde79e14fae
  - af5b9f095c2f30f96b5efc79d2d15162b47e50ea
  - 4e336d8a4821ddc8cf0458dd5f2681f1c6b35356
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

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge e3e1fc32e (no x00557 content); git log traces S1 to 702e6f88f, full message read. Verified: (1) the workflow stopped claiming it refreshes candidates (the flag that changed nothing is gone) and ended the 'green while nothing could merge' shape — run #216 was green while the queue was stuck; a stale queue now ends NON-ZERO, the visible part of a run anyone reads at a glance (acceptance item 1); (2) the workflow's name/description say what it does; (3) CI-only reporting keeps the non-goal 'no admin credential in CI' — the token-generated bot commit problem (#99) is the documented reason; (4) current tree confirms the follow-up fdcc2f416 (x00628 S1) later reduced the step to pure reporting per S2's decision — consistent, not contradictory; (5) gate run verbatim: npx vitest run tools/scripts/forge/keep-the-queue-moving.script.spec.ts = 21/21 exit 0. bun run typecheck exit 0. No out-of-scope changes beyond the proposal doc and bootstrap pointer.
- review-attribution: unrecorded — nothing in Git names who delivered 702e6f88fa9d31cdcc897b2b64de6947061e43cb: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — Refreshing happens where a real credential lives

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge e3e1fc32e; git log traces the refresh behaviour to acf7d4dc1 (fast-forward refresh) with fcee7fa5b (x00650) later putting it on a clock; S2's own Status documents the divergence honestly — as built the refresh hangs off the host's hydration watch (onTick), NOT the hydration module the plan named, and the gate signal is only that declared files predate the proposal. Verified in the current tree by reading both halves: (1) host-server.script.ts defines refreshCandidatesInBackground (line 111) which runs tools/scripts/git/hydrate-candidates-after-merge.script.ts detached and never fatal, invoked from the watch tick (line 410) and on a configurable interval (line 426) that a 0 turns off — the owner machine refreshes with ITS OWN credential, which is the whole point of the slice; (2) keep-the-queue-moving.script.ts only reports (named behind/blocked/clean states; a run that concluded 'not behind' from 'unknown' and updated nothing is the documented defect the script now avoids); CI carries no credential that publishes (non-goal held: a bot-attributed commit's runs are parked by the forge — the #99 finding); (3) slice gate run verbatim: npx vitest run packages/core/tests/src/lib/startup-reconciler = 89/89 exit 0. bun run typecheck exit 0.
- review-attribution: unrecorded — nothing in Git names who delivered acf7d4dc129d3b703d713ffc648dabde79e14fae: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S3 — A tag publishes that tag; a manual run derives the next version

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge e3e1fc32e; git log traces S3 to af5b9f095, full message read. Verified: (1) the defect is named precisely — on a tag push the checkout sits ON the tag, so <latest tag>..HEAD is empty, the bump derives 'none', and every install/build/publish/GitHub-Release step is skipped: a green run that published nothing; (2) versionFromTagRef makes a tag run publish exactly the version its tag names — a tag is an instruction, not a question — while a manual run still derives the next version as before (acceptance item 2, both halves); (3) a tag run first proves its tag points at the commit being built, so a tag moved after the fact cannot publish a different tree than the one it labels; (4) release.yml updated in the same commit; (5) gate run verbatim: npx vitest run packages/core/tests/derive-version.spec.ts = 11/11 exit 0 — the spec asserts the publish step is reached for both paths, as the acceptance requires. bun run typecheck exit 0. No out-of-scope changes: the commit touches release.yml, derive-version.script.ts, its spec and the proposal doc.
- review-attribution: unrecorded — nothing in Git names who delivered af5b9f095c2f30f96b5efc79d2d15162b47e50ea: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S4 — A pull request opened by automation gets a check that counts

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge 9d2d9beb1 (a develop-merge into the candidate branch); git log traces S4 to 4e336d8a4 (with follow-up 20a1d84df arming auto-merge with the declared method), full message read. Verified: (1) the defect was ORDER — openCandidate opened the forward-sync PR, armed auto-merge, and only THEN dispatched ci.yml; when dispatch failed the refusal left auto-merge armed behind a check nobody started — a standing promise to land the branch that waits forever with no red mark and no pending run, indistinguishable from a slow queue; (2) fixed by dispatching FIRST: a failed dispatch leaves the PR unarmed and says so, naming that auto-merge was NOT armed, why it matters, and both commands to finish by hand — an explicit, recoverable error (acceptance item 3); outside a workflow run nothing is dispatched (a person's push builds like any other); (3) effects are injected so the spec asks only the order question, and the implementer restored the previous order to confirm both ordering tests fail against it — verification by counterfactual, not assumption; (4) gate run verbatim: npx vitest run tools/scripts/forge/forward-sync-release.script.spec.ts = 12/12 exit 0. bun run typecheck exit 0. Non-goal 'no silent retries' held: the job reports and stops.
- review-attribution: claude-opus-5 from Merge pull request #347 from CartagoGit/delendai/pr/claude-opus-5/x00557-S4-g1/never-arm-behind-a-check-that-will-not-arrive (refs/heads/delendai/wip/claude-opus-5/x00557-S4-g1/never-arm-behind-a-check-that-will-not-arrive) (4e336d8a4821ddc8cf0458dd5f2681f1c6b35356), opened by qwen-3.8-max
## acceptance

- A run of the queue job whose candidates are stale ends non-zero, and
  its name and description describe what it does.
- Pushing a `vX.Y.Z` tag publishes that version, and a manual run still
  derives the next one; both are covered by a test that asserts the
  publish step is reached.
- The forward-sync either produces a check the branch rule accepts, or
  ends with an explicit, recoverable error naming what is missing.
- No job in this repository exits 0 having only printed instructions.
