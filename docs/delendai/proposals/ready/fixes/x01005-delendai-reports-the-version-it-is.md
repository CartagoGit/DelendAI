---
id: x01005
title: "delendai reports the version it is"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# x01005 — delendai reports the version it is

## goal

delendai --version, the help header and the server startup report print the published version of their own package (cli 0.3.0, core 0.3.0) instead of a hard-coded 0.1.0, read from one source per package, and a spec fails when a hard-coded product version drifts from its package.json.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

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

## acceptance

- CLI_VERSION equals packages/cli/package.json version
- DEFAULT_CLI_ARGS.serverVersion equals packages/core/package.json version
- a spec fails when a version-defining source holds a literal semver string
