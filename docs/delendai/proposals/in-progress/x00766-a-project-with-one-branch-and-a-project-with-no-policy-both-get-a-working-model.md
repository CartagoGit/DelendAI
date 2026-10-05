---
id: x00766
title: "A project with one branch and a project with no policy both get a working model"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-30
last-transition-id: 9daf22cf-651c-413d-a0bd-79c992f30aa3
last-correlation-id: 9daf22cf-651c-413d-a0bd-79c992f30aa3
last-transition-from: ready
---

# x00766 — A project with one branch and a project with no policy both get a working model

## Goal

A project whose only branch is main starts and works under every profile, and a project that declares no development block gets the same model from work, the guards and the served instructions.

## why

A consumer probe with integration and release both main failed at startup with release-must-differ, and the work command refuses a repo with no development block while the served instructions tell its agents to run it. Both make delendai depend on the project being shaped like delendai's own repository. The project's configuration is the single source of truth; a differently shaped project must be served, not refused.

## non-goals

- Release tooling in plugins/git and plugins/forge, the commit-policy push driver, and the wording of declare-workflow.ts are other work.
- The adoption migrator that writes a `development` block at server start is unchanged.

## Slices

- global_gate: none

### S1 — One branch is a valid shape
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/release-branch.ts`, `packages/core/src/lib/development-policy/served-work-model.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/validate.ts`, `packages/core/src/lib/development-policy/validate-combinations.ts`, `packages/core/src/lib/development-policy/git-guard-namespaces.ts`, `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/src/lib/prompts/agent-policy-instructions.helper.ts`, `packages/core/src/public/index.ts`, `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/forge/forward-sync-release.script.ts`, `tools/scripts/lint/pr-head-shape.script.ts`
- **Gate**: type
- acceptance:
  - "integration equal to release, or release omitted, starts and validates"
  - "no consumer writes duplicate protection or treats the integration branch as a forbidden release target"
  - "served instructions name no release branch when there is none"
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — An undeclared policy is one resolution path
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/development-policy/effective-policy.ts`, `packages/core/src/lib/work-units/development-policy.service.ts`, `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/work-units/workflow-doctor.service.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/contracts/interfaces/guard.interface.ts`, `packages/cli/src/commands/review.command.ts`
- **Gate**: type
- acceptance:
  - "work, guards and instructions resolve the same effective policy"
  - "instructions say when the policy was adopted rather than declared"
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Specs for both shapes and a real-git single-branch landing
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `packages/core/tests/src/lib/development-policy/single-branch.spec.ts`, `packages/core/tests/src/lib/development-policy/effective-policy.spec.ts`, `packages/core/tests/src/lib/development-policy/validate.spec.ts`, `packages/core/tests/src/lib/development-policy/project-branches.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-land.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`, `packages/core/tests/src/lib/work-units/development-policy.service.spec.ts`, `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts`, `packages/cli/src/commands/guard.command.spec.ts`, `tools/scripts/governance/forge-settings.lib.spec.ts`
- **Gate**: none
- acceptance:
  - "a real-git single-branch shared-checkout-merge work publish lands on main after the gate"
  - "integration=release no longer blocks validation"
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- integration equal to release, or release omitted, starts and validates
- no consumer writes duplicate protection or treats the integration branch as a forbidden release target
- served instructions name no release branch when there is none
- work, guards and instructions resolve the same effective policy
- instructions say when the policy was adopted rather than declared
- a real-git single-branch shared-checkout-merge work publish lands on main after the gate
- integration=release no longer blocks validation
