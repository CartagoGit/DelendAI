---
id: f00795
title: "The promotion to the release branch opens by itself when the next roadmap milestone is ready"
kind: feat
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# f00795 — The promotion to the release branch opens by itself when the next roadmap milestone is ready

## goal

develop is promoted into main when the roadmap's next milestone is ready, with no one having to remember: the queue opens the promotion as soon as develop is green, carries no open alert and the milestone's blocking gates pass; the release gate judges the whole promotion; the merge tags the version, and develop is brought level with main again.

## why

On 2026-10-29 main was 859 commits behind develop and the last release (0.2.4) was five days old. Every piece of the release flow existed (`open-promotion` checks readiness, `release-pr-gate` runs the full check on the promotion, `release.yml` tags, `forward-sync-release` rehydrates develop), but nothing opened a promotion: `roadmap.promotion.schedule` was not declared, so `open-promotion` had nothing to do, and no workflow ran it. The owner chose the cadence: by roadmap milestones.

Three things stood in the way besides the trigger. Every promotion is a release: develop must carry a version above main's and its CHANGELOG section (`release:prepare`), or the release gate refuses it. A pull request opened with the workflow token starts no workflow, so a promotion the queue opened would never get its release gate; the gate has to be dispatched. And the roadmap's only horizon is 0.2.0, already released: with no next milestone declared, nothing could ever be ready.

## non-goals

- Publishing to npm, which stays a deliberate, dispatched step of `release.yml`.
- Deciding what a version promises: committing an entry to a horizon is the owner's decision.

## slices

- global_gate: type

### S1 — The queue opens the promotion when it is ready
- **Status**: pending
- **Files**: `delendai.config.json`, `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: type
- acceptance:
  - "`plugins.roadmap.options.promotion.schedule` is `on-ready`, and the hourly queue job runs `open-promotion --apply`, which opens the develop → main pull request only when develop's required checks are green, no code scanning alert is open and the next horizon's blocking gates pass, and says which condition holds it otherwise."

### S2 — A promotion the queue opened gets its release gate
- **Status**: pending
- **Files**: `.github/workflows/keep-the-queue-moving.yml`, `.github/workflows/release-pr-gate.yml`
- **Gate**: type
- acceptance:
  - "When the queue opens a promotion it dispatches `release-pr-gate` on the integration branch, and the gate's dispatched run checks what its pull-request run checks (the version and changelog against main, and open alerts, included), so the promotion is judged although a pull request opened with the workflow token starts no run."

### S4 — The release is prepared when the milestone is ready
- **Status**: pending
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: type
- acceptance:
  - "When the next horizon is ready and develop carries no version above main's, the queue prepares the release in a unit (`release:prepare`: the version the horizon names and its CHANGELOG section) and publishes it, so the promotion opens on a develop that carries its release; a gate that fails says which."

### S3 — The roadmap names the next milestone
- **Status**: pending
- **Files**: `docs/delendai/ROADMAP.md`
- **Gate**: type
- acceptance:
  - "The roadmap holds the 0.3.0 horizon with the entries the owner commits to it, each gated on its proposals being done."

## acceptance

- `plugins.roadmap.options.promotion.schedule` is `on-ready`, and the hourly queue job runs `open-promotion --apply`, which opens the develop → main pull request only when develop's required checks are green, no code scanning alert is open and the next horizon's blocking gates pass, and says which condition holds it otherwise.
- When the queue opens a promotion it dispatches `release-pr-gate` on the integration branch, and the gate's dispatched run checks what its pull-request run checks (the version and changelog against main, and open alerts, included), so the promotion is judged although a pull request opened with the workflow token starts no run.
- When the next horizon is ready and develop carries no version above main's, the queue prepares the release in a unit (`release:prepare`: the version the horizon names and its CHANGELOG section) and publishes it, so the promotion opens on a develop that carries its release; a gate that fails says which.
- The roadmap holds the 0.3.0 horizon with the entries the owner commits to it, each gated on its proposals being done.
