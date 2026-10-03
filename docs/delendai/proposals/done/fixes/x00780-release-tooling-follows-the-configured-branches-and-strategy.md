---
id: x00780
title: "Release tooling follows the configured branches and strategy"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-30
last-transition-id: b730b7c6-d4a6-4560-a973-0855b473f9cd
last-transition-id: d0abb747-4651-40c0-a813-7e878ae390c8
last-correlation-id: d0abb747-4651-40c0-a813-7e878ae390c8
last-transition-from: review
---

# x00780 — Release tooling follows the configured branches and strategy

## Goal

The release tools (candidate cut, release pull request, finalize, reconcile) take the integration and release branch, the versioned manifest and the promotion step from the project's resolved development policy instead of hardcoding develop, main and packages/core/package.json, so any consumer project releases by its own configuration.

## why

The release tools name this repository's shape: git.ts, release and release-finalize read `develop`, `main` and `packages/core/package.json`, and the forge release tools always open a pull request into `main`. A consumer with other branch names, one branch, or the merge strategy cannot use them. The project's configuration is the single source of truth for branches and strategy.

## non-goals

- Adding a release strategy or a versioned-packages key to the development config schema.
- Changing the persisted candidate field names (sourceDevelopSha, baseMainSha).
- commit-policy push-driver, proposals, cli doctor and init, declare-workflow and the adopt migrator.

## Slices

- global_gate: none

### S1 — Release target resolved from the policy; git and forge release tools consume it
- **Status**: done
- **Files**: `packages/core/src/lib/development-policy/release-target.ts`, `packages/core/src/lib/development-policy/release-target.interface.ts`, `packages/core/src/public/index.ts`, `packages/core/src/lib/contracts/release-state/index.ts`, `packages/core/src/lib/contracts/release-finalize/index.ts`, `packages/core/tests/src/lib/development-policy/release-target.spec.ts`, `plugins/git/src/lib/services/git.ts`, `plugins/git/src/lib/release/index.ts`, `plugins/git/src/lib/release-finalize/index.ts`, `plugins/forge/src/lib/release-pr/index.ts`, `plugins/forge/src/lib/release-finalize/index.ts`, `plugins/git/tests/release/r2.spec.ts`, `plugins/git/tests/release/release-target-shapes.spec.ts`, `plugins/git/tests/release-finalize/index.spec.ts`, `plugins/git/tests/release-finalize/e2e.spec.ts`, `plugins/git/tests/src/lib/release.spec.ts`, `plugins/forge/tests/release-pr/index.spec.ts`, `plugins/forge/tests/release-pr/release-target-shapes.spec.ts`, `plugins/forge/tests/release-finalize/index.spec.ts`, `tools/scripts/release/dogfood/dogfood.script.ts`, `tools/scripts/release/dogfood/dogfood.spec.ts`
- **Gate**: none
- acceptance:
  - "Branch names come from the resolved policy; the versioned manifest is an explicit input defaulting to the root package.json."
  - "A single-branch project has no release promotion step and the tools say so instead of opening a pull request into a branch that does not exist."
  - "Under the merge and direct strategies no pull request is requested; promotion follows integration.strategy because the policy does not model release promotion separately."
  - "This repository (develop to main by pull request, versioned in packages/core) releases unchanged."
- shipped-in: `9d46a11aaeeb`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Branch names come from the resolved policy; the versioned manifest is an explicit input defaulting to the root package.json.
- A single-branch project has no release promotion step and the tools say so instead of opening a pull request into a branch that does not exist.
- Under the merge and direct strategies no pull request is requested; promotion follows integration.strategy because the policy does not model release promotion separately.
- This repository (develop to main by pull request, versioned in packages/core) releases unchanged.

## Notes

- The policy models how work reaches the integration branch, not a separate release strategy, so release promotion is derived: no separate release branch means no promotion; otherwise it follows `integration.strategy` (pull-request opens a pull request; merge and direct merge or push the candidate and make no forge call).
- The versioned manifest is an explicit input that defaults to the root `package.json`; this repository's own release script names `packages/core/package.json`.
- The release pull request description no longer carries the repository-specific antecedent line.
