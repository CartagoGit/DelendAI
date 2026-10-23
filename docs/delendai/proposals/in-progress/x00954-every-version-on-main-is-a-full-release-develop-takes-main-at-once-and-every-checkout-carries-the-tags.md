---
id: x00954
title: "Every version on main is a full release, develop takes main at once, and every checkout carries the tags"
kind: fix
status: in-progress
type: proposal
track: release
date: 2026-10-23
last-transition-id: 38bea40c-570c-4b28-8e29-5b21c13191a7
last-correlation-id: 38bea40c-570c-4b28-8e29-5b21c13191a7
last-transition-from: ready
last-transition-at: 2026-10-23T16:14:39.560Z
---

# x00954 — Every version on main is a full release, develop takes main at once, and every checkout carries the tags

## goal

A version that reaches main is tagged and published as a full (latest) GitHub Release, develop receives main through the forward sync right away, and both happen even when GitHub loses the push event; every checkout fetches the release tags so they show in git graphs.

## why

Owner, 2026-10-23: the 0.2.1 promotion (#1396, merge e43f72422) reached main while GitHub answered 502, and its push event started no workflow: no v0.2.1 tag, no GitHub Release, no forward sync; develop stayed behind main until both workflows were dispatched by hand. release.yml creates every Release with --prerelease, so 0.2.0 and 0.2.1 showed as pre-releases although each version on main is a release (they were edited by hand to full, v0.2.1 latest). The start-up fetch names explicit refspecs and no tag refspec, so a checkout does not reliably carry the release tags the owner expects in the git graph. The Dependabot graph also kept reading the 1.31.0 manifest because no push of main was processed.

## non-goals

- Publishing to npm (the owner decides; release.yml keeps it manual).
- Changing how promotions are prepared (f00787, x00938).

## slices

- global_gate: type

### S1 — Full releases
- **Status**: pending
- **Files**: `.github/workflows/release.yml`
- **Gate**: type
- acceptance:
  - "release.yml creates the Release without --prerelease and marks it latest; a manual run makes an existing pre-release of main's version a full latest release."
  - "The workflow comments describe a full release."

### S2 — A lost push event is recovered
- **Status**: pending
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Each queue run checks main: when main's lockstep version has no tag it dispatches release.yml on main; when main has commits develop lacks and no forward-sync pull request is open it dispatches forward-sync-release; a spec drives both decisions from fake forge answers."
  - "The run prints what it dispatched and why."

### S3 — Checkouts carry the release tags
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/contracts.constant.ts`, `packages/core/tests/src/lib/startup-reconciler/git-seam.spec.ts`
- **Gate**: type
- acceptance:
  - "The start-up fetch also fetches refs/tags/v* into refs/tags; a spec on the argv proves the refspec, and a new release tag on the remote appears locally after the next start-up."

## acceptance

- release.yml creates the Release without --prerelease and marks it latest; a manual run makes an existing pre-release of main's version a full latest release.
- The workflow comments describe a full release.
- Each queue run checks main: when main's lockstep version has no tag it dispatches release.yml on main; when main has commits develop lacks and no forward-sync pull request is open it dispatches forward-sync-release; a spec drives both decisions from fake forge answers.
- The run prints what it dispatched and why.
- The start-up fetch also fetches refs/tags/v* into refs/tags; a spec on the argv proves the refspec, and a new release tag on the remote appears locally after the next start-up.
