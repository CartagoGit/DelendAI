---
id: x01005
title: "delendai reports the version it is"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-11-02
last-transition-id: b4938806-100d-43ee-9d24-3a2f9e50e53f
last-correlation-id: b4938806-100d-43ee-9d24-3a2f9e50e53f
last-transition-from: review
last-transition-at: 2026-11-18T02:54:25.475Z
shipped-in:
  - "cf39e9ec4d28650c4ec158677f76b86e32bacd15"
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
- **Status**: done
- **Files**: `packages/cli/src/contracts/constants/version.constant.ts`, `packages/cli/src/contracts/constants/version.constant.spec.ts`, `packages/core/src/lib/plugins/parse-cli-args.ts`, `packages/core/src/lib/scaffold/standalone-core-tools.ts`, `packages/core/src/lib/version.spec.ts`
- **Gate**: none
- acceptance:
  - "CLI_VERSION equals packages/cli/package.json version"
  - "DEFAULT_CLI_ARGS.serverVersion equals packages/core/package.json version"
  - "a spec fails when a version-defining source holds a literal semver string"
- shipped-in: `0ba3b22bf10f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — shipped-in 0ba3b22bf10f is stale: slice files changed afterward (e.g. 53c5f4fb0). Redeliver S1 on current HEAD and resubmit with fresh shipped-in plus scoped evidence.
- review-log: approved by mai-code-2 — verified at cf39e9ec4d28, validate exit 0 and tests 4/4 claimed, no recorded run cited; acceptance 3/3: (1) Source imports ../../../package.json and version.constant.spec.ts passed. (2) Both values derive from DELENDAI_VERSION; packages/core version spec passed. (3) version.spec.ts scans all four source files and rejects literal semantic versions; scoped specs passed. — Verified cf39e9ec: CLI_VERSION and DELENDAI_VERSION are read from their respective package manifests, DEFAULT_CLI_ARGS/server scaffold use the core constant, and the regression spec rejects literal semvers in each version-defining source. Scoped version specs passed.

## acceptance

- CLI_VERSION equals packages/cli/package.json version
- DEFAULT_CLI_ARGS.serverVersion equals packages/core/package.json version
- a spec fails when a version-defining source holds a literal semver string
