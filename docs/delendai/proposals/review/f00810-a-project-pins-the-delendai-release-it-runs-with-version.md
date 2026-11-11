---
id: f00810
title: "A project pins the delendai release it runs with --version"
kind: feat
status: review
type: proposal
track: general
date: 2026-11-08
last-transition-id: 6840f9bf-a7d1-48ae-8a6d-60d0c35fee71
last-correlation-id: 6840f9bf-a7d1-48ae-8a6d-60d0c35fee71
last-transition-from: in-progress
last-transition-at: 2026-11-10T02:34:52.068Z
---

# f00810 — A project pins the delendai release it runs with --version

## goal

A consuming project's MCP entry can pass --version=<semver> to run the release tag of that version (tag prefix read from one place) from its own cached detached worktree, as --branch does. A tag does not move, so it never restarts. Installed from npm, the same flag means the package version (a seam, not yet wired). --branch with --version refuses to start; a version with no tag, or malformed, refuses to start naming the version and the nearest tags, never falling back to the checkout. The server reports at startup the exact version or branch it runs, and init can write either flag.

## why

Owner request: pin the release a project runs, so landing work in the delendai checkout or on a branch does not change or restart it.

## non-goals

- Publishing to npm or wiring the npm resolution end to end.

## slices

- global_gate: none

### S1 — Pin a release with --version
- **Status**: review
- **Files**: `tools/scripts/host/branch-runtime.helper.ts`, `tools/scripts/host/branch-runtime.helper.spec.ts`, `tools/scripts/host/host-server.script.ts`, `packages/cli/src/commands/init/init.command.ts`
- **Gate**: none
- acceptance:
  - "--version=0.3.0 runs tag v0.3.0 from its own cached worktree"
  - "--branch with --version refuses to start with the reason"
  - "a missing or malformed version refuses to start naming the nearest tags, with no fallback"
  - "the startup report names the version or branch"
  - "init writes either flag"
- shipped-in: `0641f33ded4e`
- review-state: in_review
- review-implementer: claude-sonnet-5-5
- review-log: requested_changes by claude-opus-5-5 — Four of five acceptance lines hold and the specs pass (branch-runtime.helper.spec.ts + init-default.command.spec.ts: 25/25): --version=0.3.0 runs v0.3.0 from branch-runtime/release@v0.3.0 detached; --branch with --version is refused (runtimePin + init USAGE); the startup report names the release or branch (runtimeReport/branchLabel); init writes either flag. Gap against acceptance line 3 'a missing or malformed version refuses to start naming the nearest tags' (and the goal 'malformed ... naming the version and the nearest tags'): tools/scripts/host/branch-runtime.helper.ts:96-100 refuses a malformed version in runtimePin before any tag is read, with only 'is not a semantic version' and no tags; nearestReleaseTags (line ~124) returns [] for a non-semver input anyway, and the spec 'refuses both flags together, and a malformed version' only checks kind==='refused'. To approve: a malformed --version refusal also lists the release tags that exist (e.g. the latest NEAREST_TAGS_EACH_SIDE*2 v* tags, or the tags sharing its MAJOR[.MINOR] prefix), with a spec asserting the tags appear in that reason; or amend the acceptance line through the proposal if malformed input is meant to be refused without tags.

## acceptance

- --version=0.3.0 runs tag v0.3.0 from its own cached worktree
- --branch with --version refuses to start with the reason
- a missing or malformed version refuses to start naming the nearest tags, with no fallback
- the startup report names the version or branch
- init writes either flag
