---
id: x00780
title: "Release tooling follows the configured branches and strategy"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-30
---

# x00780 — Release tooling follows the configured branches and strategy

## Goal

The release tools (candidate cut, release pull request, finalize, reconcile) take the integration and release branch, the versioned manifest and the promotion step from the project's resolved development policy instead of hardcoding develop, main and packages/core/package.json, so any consumer project releases by its own configuration.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: none

### S1 — Release target resolved from the policy; git and forge release tools consume it
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/release-target.ts`, `packages/core/src/lib/development-policy/release-target.interface.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/development-policy/release-target.spec.ts`, `plugins/git/src/lib/services/git.ts`, `plugins/git/src/lib/release/index.ts`, `plugins/git/src/lib/release-finalize/index.ts`, `plugins/forge/src/lib/release-pr/index.ts`, `plugins/forge/src/lib/release-finalize/index.ts`, `plugins/git/tests/release/r2.spec.ts`, `plugins/git/tests/release/release-target-shapes.spec.ts`, `plugins/git/tests/release-finalize/index.spec.ts`, `plugins/git/tests/release-finalize/e2e.spec.ts`, `plugins/git/tests/src/lib/release.spec.ts`, `plugins/forge/tests/release-pr/index.spec.ts`, `plugins/forge/tests/release-pr/release-target-shapes.spec.ts`, `plugins/forge/tests/release-finalize/index.spec.ts`, `tools/scripts/release/dogfood/dogfood.script.ts`, `tools/scripts/release/dogfood/dogfood.spec.ts`
- **Gate**: none
- acceptance:
  - "Branch names come from the resolved policy; the versioned manifest is an explicit input defaulting to the root package.json."
  - "A single-branch project has no release promotion step and the tools say so instead of opening a pull request into a branch that does not exist."
  - "Under the merge and direct strategies no pull request is requested; promotion follows integration.strategy because the policy does not model release promotion separately."
  - "This repository (develop to main by pull request, versioned in packages/core) releases unchanged."

## acceptance

- Branch names come from the resolved policy; the versioned manifest is an explicit input defaulting to the root package.json.
- A single-branch project has no release promotion step and the tools say so instead of opening a pull request into a branch that does not exist.
- Under the merge and direct strategies no pull request is requested; promotion follows integration.strategy because the policy does not model release promotion separately.
- This repository (develop to main by pull request, versioned in packages/core) releases unchanged.
