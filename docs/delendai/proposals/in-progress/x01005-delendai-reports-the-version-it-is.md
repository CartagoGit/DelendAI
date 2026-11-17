---
id: x01005
title: "delendai reports the version it is"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-02
last-transition-id: f3741c72-d239-4fb6-9a17-fb00d0fd375f
last-correlation-id: f3741c72-d239-4fb6-9a17-fb00d0fd375f
last-transition-from: ready
last-transition-at: 2026-11-17T07:55:00.119Z
---

# x01005 — delendai reports the version it is

## goal

delendai --version, the help header and the server startup report print the published version of their own package (cli 0.3.0, core 0.3.0) instead of a hard-coded 0.1.0, read from one source per package, and a spec fails when a hard-coded product version drifts from its package.json.

## why

delendai --version, the help header and the server startup report printed 0.1.0 while the released packages are 0.3.0: CLI_VERSION and the server default were string literals, and nothing tied them to a package.json. core already exposes DELENDAI_VERSION from its own manifest, which the defaults ignored.

## non-goals

- Bumping the private root package.json version.
- A new release step: release:prepare already bumps each package.json, and the versions now follow it.

## slices

- global_gate: none

### S1 — Read each version from its own package.json and guard it
- **Status**: pending
- **Files**: `packages/cli/src/contracts/constants/version.constant.ts`, `packages/cli/src/contracts/constants/version.constant.spec.ts`, `packages/core/src/lib/plugins/parse-cli-args.ts`, `packages/core/src/lib/scaffold/standalone-core-tools.ts`, `packages/core/src/lib/version.spec.ts`
- **Gate**: none
- acceptance:
  - "CLI_VERSION equals packages/cli/package.json version"
  - "DEFAULT_CLI_ARGS.serverVersion equals packages/core/package.json version"
  - "a spec fails when a version-defining source holds a literal semver string"
- shipped-in: `0ba3b22bf10f`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — shipped-in 0ba3b22bf10f is stale: slice files changed afterward (e.g. 53c5f4fb0). Redeliver S1 on current HEAD and resubmit with fresh shipped-in plus scoped evidence.

## acceptance

- CLI_VERSION equals packages/cli/package.json version
- DEFAULT_CLI_ARGS.serverVersion equals packages/core/package.json version
- a spec fails when a version-defining source holds a literal semver string
