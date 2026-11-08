---
id: f00810
title: "A project pins the delendai release it runs with --version"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-08
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
- **Status**: pending
- **Files**: `tools/scripts/host/branch-runtime.helper.ts`, `tools/scripts/host/branch-runtime.helper.spec.ts`, `tools/scripts/host/host-server.script.ts`, `packages/cli/src/commands/init/init.command.ts`
- **Gate**: none
- acceptance:
  - "--version=0.3.0 runs tag v0.3.0 from its own cached worktree"
  - "--branch with --version refuses to start with the reason"
  - "a missing or malformed version refuses to start naming the nearest tags, with no fallback"
  - "the startup report names the version or branch"
  - "init writes either flag"

## acceptance

- --version=0.3.0 runs tag v0.3.0 from its own cached worktree
- --branch with --version refuses to start with the reason
- a missing or malformed version refuses to start naming the nearest tags, with no fallback
- the startup report names the version or branch
- init writes either flag
