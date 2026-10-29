---
id: f00795
title: "The promotion to the release branch opens by itself when the next roadmap milestone is ready"
kind: feat
status: in-progress
type: proposal
track: ci
date: 2026-10-29
last-transition-id: b7d27626-1a9e-4607-a804-21e8c99ffeca
last-correlation-id: b7d27626-1a9e-4607-a804-21e8c99ffeca
last-transition-from: ready
last-transition-at: 2026-10-29T13:42:39.761Z
---

# f00795 — The promotion to the release branch opens by itself when the next roadmap milestone is ready

## goal

develop is promoted into main when the roadmap's next milestone is ready, with no one having to remember: the queue opens the promotion as soon as develop is green, carries no open alert and the milestone's blocking gates pass; the release gate judges the whole promotion; the merge tags the version, and develop is brought level with main again.

## why

On 2026-10-29 main was 859 commits behind develop and the last release (0.2.4) was five days old. Every piece of the release flow existed (`open-promotion` checks readiness, `release-pr-gate` runs the full check on the promotion, `release.yml` tags, `forward-sync-release` rehydrates develop), but nothing opened a promotion: `roadmap.promotion.schedule` was not declared, so the `open-promotion` workflow the policy projects was never generated; and declared `on-ready`, it ran on a push to develop, when the checks of the new head have not run, and a queue merge starts no push run at all. The owner chose the cadence: by roadmap milestones.

Three things stood in the way besides the trigger. Every promotion is a release: develop must carry a version above main's and its CHANGELOG section (`release:prepare`), or the release gate refuses it. The required `CodeQL` check is posted by code scanning on pull requests only, so read from develop's check runs it never reported and a promotion would have waited forever; on a push the same tool uploads an analysis instead. And the roadmap's only horizon is 0.2.0, already released: with no next milestone declared, nothing could ever be ready. A pull request the workflow token opens does start its `pull_request` runs (the forward syncs, #1457), so the release gate needs no dispatch; its dispatched run, a rerun by hand, judged less than its pull-request run.

## non-goals

- Publishing to npm, which stays a deliberate, dispatched step of `release.yml`.
- Deciding what a version promises: committing an entry to a horizon is the owner's decision.
- Writing the release from a workflow: `release:prepare` changes develop, which is a unit's work under an agent's name, not the queue's.

## slices

- global_gate: type

### S1 — The queue opens the promotion when it is ready
- **Status**: pending
- **Files**: `delendai.config.json`, `tools/scripts/governance/promotion-workflow.lib.ts`, `tools/scripts/governance/promotion-workflow.lib.spec.ts`, `.github/workflows/open-promotion.yml`, `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: type
- acceptance:
  - "`plugins.roadmap.options.promotion.schedule` is `on-ready`, and the `open-promotion` workflow projected from it asks every hour (a push comes before the checks its head needs, and a token merge starts none; promotion-workflow.lib.spec.ts), fetching the release branch, and runs `open-promotion --apply`, which opens the develop → main pull request only when develop's required checks are green (a code scanning tool's check counting as reported when that tool has an analysis on the head, open-promotion.script.spec.ts), no code scanning alert is open and the next horizon's blocking gates pass, and says which condition holds it otherwise."

### S2 — The release gate's dispatched run judges what its pull-request run does
- **Status**: pending
- **Files**: `.github/workflows/release-pr-gate.yml`
- **Gate**: type
- acceptance:
  - "`release-pr-gate`'s dispatched run checks what its pull-request run checks: the version and changelog of the branch it runs on against main, and the alerts open on that branch."

### S4 — A promotion that is not a release yet is held back and says how to prepare it
- **Status**: pending
- **Files**: `tools/scripts/forge/open-promotion.script.ts`, `tools/scripts/forge/open-promotion.script.spec.ts`, `tools/scripts/release/release-pr-check.script.ts`
- **Gate**: type
- acceptance:
  - "`open-promotion` holds the promotion back while develop carries no version above main's or no CHANGELOG section for it (the gaps `release:check` reports, from one `releaseGaps`), naming each gap and `bun run release:prepare --write` as the fix, so it never opens a promotion the release gate refuses (open-promotion.script.spec.ts)."

### S3 — The roadmap names the next milestone
- **Status**: pending
- **Files**: `docs/delendai/ROADMAP.md`
- **Gate**: type
- acceptance:
  - "The roadmap holds the 0.3.0 horizon the owner committed on 2026-10-29 (a fast flow, every host held to the workflow, plugins that connect, Batuta working), each entry gated on its proposals being done."

## acceptance

- `plugins.roadmap.options.promotion.schedule` is `on-ready`, and the `open-promotion` workflow projected from it asks every hour (a push comes before the checks its head needs, and a token merge starts none; promotion-workflow.lib.spec.ts), fetching the release branch, and runs `open-promotion --apply`, which opens the develop → main pull request only when develop's required checks are green (a code scanning tool's check counting as reported when that tool has an analysis on the head, open-promotion.script.spec.ts), no code scanning alert is open and the next horizon's blocking gates pass, and says which condition holds it otherwise.
- `release-pr-gate`'s dispatched run checks what its pull-request run checks: the version and changelog of the branch it runs on against main, and the alerts open on that branch.
- `open-promotion` holds the promotion back while develop carries no version above main's or no CHANGELOG section for it (the gaps `release:check` reports, from one `releaseGaps`), naming each gap and `bun run release:prepare --write` as the fix, so it never opens a promotion the release gate refuses (open-promotion.script.spec.ts).
- The roadmap holds the 0.3.0 horizon the owner committed on 2026-10-29 (a fast flow, every host held to the workflow, plugins that connect, Batuta working), each entry gated on its proposals being done.
