---
id: f00801
title: "Each branch of a project says how it takes in other work"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# f00801 — Each branch of a project says how it takes in other work

## goal

A project that uses delendai declares, branch by branch, how that branch takes in work: by pull request, by merge, or by direct commits and pushes, and which branches it follows after another moves. One project can then take pull requests into `main`, merges into `develop`, direct pushes on a branch of its own, and have `develop` take in each release once `main` has it. The rules are the project's configuration; this repository keeps the flow it already declares, and a project that declares nothing keeps its profile's behaviour.

## why

Asked by the owner on 2026-11-02 for the projects that use delendai, starting with one that wants merges into `develop` and pull requests into `main`, with `develop` refreshed from `main` after a release. Read that day in the code:

- A profile has one `integration.requiresPullRequest` for both branches: `shared-checkout-merge` sets it `false`, and the guard's push judge then lets `main` be pushed directly as much as `develop`; `shared-checkout-pr` sets it `true` for both. No setting makes the two differ.
- Release already has its own approvals and checks (`releaseRequiredApprovals`, `releaseRequiredChecks`), the place a per-branch rule belongs beside.
- Taking a release back into the integration branch exists only in this repository (`tools/scripts/forge/forward-sync-release.script.ts` and its workflow): a consumer gets none of it.
- A branch where an agent or a person commits and pushes directly (a sandbox, docs, a hotfix lane) has no way to be declared: under a pinned profile it is outside the namespaces and refused.

## non-goals

- Changing this repository's flow, which its configuration already declares.
- Changing what a profile does for a project that declares no branch rules.
- Branch protection on the forge, which stays the project owner's.

## slices

- global_gate: type

### S1 — A branch declares how it takes in work
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/contracts/interfaces/branch-rule.interface.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/development-policy/derive.ts`, `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/development-policy/effective-policy.ts`, `packages/core/src/lib/development-policy/branch-rules.ts`, `packages/core/src/lib/development-policy/validate-branch-rules.ts`, `packages/core/src/lib/development-policy/validate-combinations.ts`, `packages/core/tests/src/lib/development-policy/branch-rules.spec.ts`, `packages/core/tests/src/lib/development-policy/resolve.spec.ts`
- **Gate**: type
- acceptance:
  - "`development.branches.rules` maps a branch name (or a glob) to how it takes in work, `pull-request`, `merge` or `direct`, and, for the integration and release branches, defaults to what the profile does today; an invalid combination (a release looser than its integration branch, a direct branch inside delendai's namespaces) is refused at load with the key that is wrong."

### S2 — The guard and the work flow follow each branch's rule
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/development-policy/branch-rules.ts`, `packages/core/tests/src/lib/development-policy/git-guard-branch-rules.spec.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`
- **Gate**: type
- acceptance:
  - "A direct push or commit to a `pull-request` branch is refused, a merge into a `merge` branch is allowed and `work publish` lands there by merge, and a `direct` branch takes commits and pushes; one spec per rule, under both pinned profiles."

### S3 — Promotion and follow
- **Status**: pending
- **Files**: `packages/core/src/lib/release/forward-sync.service.ts`, `packages/cli/src/commands/groups/release.ts`
- **Gate**: type
- acceptance:
  - "A rule may name the branch it is promoted from (`main` from `develop`) and the branch it follows (`develop` follows `main`): one delendai command opens the promotion by that branch's own route, and once the promotion lands the follower takes in what it brought by its own route, merged or by pull request; nothing happens when there is nothing to take."

## acceptance

- A project declares per branch how it takes in work, and a project that declares nothing behaves as its profile does today.
- The guard and `work publish` follow each branch's rule.
- A promotion opens by its target branch's route, and a follower branch takes in each promotion by its own route.
