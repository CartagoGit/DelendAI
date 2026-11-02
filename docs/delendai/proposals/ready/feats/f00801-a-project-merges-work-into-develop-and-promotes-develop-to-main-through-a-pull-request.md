---
id: f00801
title: "A project merges work into develop and promotes develop to main through a pull request"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# f00801 — A project merges work into develop and promotes develop to main through a pull request

## goal

A project can integrate work by merge into its integration branch while its release branch only moves through a promotion pull request, and once a release lands the integration branch takes in what the release brought, by the project's own integration route, with nothing to do by hand.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The release boundary can require a pull request on its own
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/src/lib/development-policy/git-guard.ts`
- **Gate**: none
- acceptance:
  - "development.integration.releaseRequiresPullRequest, defaulting to requiresPullRequest, makes the guard refuse a direct push to the release branch while merges into the integration branch stay direct; a spec covers shared-checkout-merge with it set."

### S2 — A promotion pull request opens from the product
- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/release.ts`
- **Gate**: none
- acceptance:
  - "A consumer opens the promotion pull request from the integration branch to the release branch with one delendai command, refused while the integration branch is not green."

### S3 — The integration branch takes in each release
- **Status**: pending
- **Files**: `packages/core/src/lib/release/forward-sync.service.ts`
- **Gate**: none
- acceptance:
  - "After a promotion merges, the integration branch takes in the release branch: merged directly where the policy integrates by merge, by a pull request where it integrates by pull request; a release that adds nothing does nothing."

## acceptance

- development.integration.releaseRequiresPullRequest, defaulting to requiresPullRequest, makes the guard refuse a direct push to the release branch while merges into the integration branch stay direct; a spec covers shared-checkout-merge with it set.
- A consumer opens the promotion pull request from the integration branch to the release branch with one delendai command, refused while the integration branch is not green.
- After a promotion merges, the integration branch takes in the release branch: merged directly where the policy integrates by merge, by a pull request where it integrates by pull request; a release that adds nothing does nothing.
