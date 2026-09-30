---
id: x00781
title: "Adoption writes exactly the policy already enforced"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-30
last-transition-id: 6d763085-aa7c-4834-83a0-a37dab8ebaa7
last-correlation-id: 6d763085-aa7c-4834-83a0-a37dab8ebaa7
last-transition-from: ready
---

# x00781 — Adoption writes exactly the policy already enforced

## Goal

There is one rule for what an undeclared project's development policy is, and the adoption migrator only writes that rule's answer into the configuration file, visibly.

## why

The project's delendai configuration is the single source of truth, so every surface must give the same answer: the served instructions, `delendai work`, the guards and the migrator. The migrator chose a profile from forge evidence (`shared-checkout-pr` on a GitHub remote, `worktree-pr` for a legacy `agentWorktree`) and wrote it into the consumer's file, while `work` on the same not-yet-migrated repository resolved `shared-checkout-merge` (or `legacy-compat`). The same repository was described differently depending on which ran first, the file was rewritten to the model nobody had been told about, and the CLI reported nothing.

## Decision

- Adoption decides nothing. `proposeAdoption` takes the policy `readWorkspacePolicy` (that is, `resolveEffectivePolicy`) already resolved and records it: profile, integration, release. What is written is exactly what was enforced.
- The forge is not evidence. `DEFAULT_DEVELOPMENT_PROFILE` is `shared-checkout-merge` because it asks nothing of the forge, so a forge probe has nothing left to decide; the `gh api` call and the remote classification at startup are removed. A project that wants pull requests declares them.
- Legacy fields (`agentWorktree`, commit-policy options) resolve as `legacy-compat` and are never migrated: they are a decision somebody made, and rewriting them changed what they meant.
- The integration branch is the stable default branch discovered from the checkout (as `work` does), not whatever branch the checkout is on.
- The write is visible: the journal records it, `resolveEffectivePolicy` marks the policy `adoption: { writtenTo }`, the served instructions, the overview work model and `work status` say "adopted and written", and the CLI prints a line when it writes.
- Opt-out: a declared block, even `"development": {}`, is never touched and resolves to the default.

## non-goals

- Release tooling in plugins/git and plugins/forge, the commit-policy push driver, plugins/proposals, cli doctor and init, and the wording of declare-workflow.ts are other work.

## Slices

- global_gate: none

### S1 — One adoption rule, visibly applied
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/adopt.ts`, `packages/core/src/lib/development-policy/adopt.interface.ts`, `packages/core/src/lib/development-policy/adoption-record.ts`, `packages/core/src/lib/development-policy/effective-policy.ts`, `packages/core/src/lib/development-policy/served-work-model.ts`, `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/workspace-migration/migration-journal-path.constant.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/core/src/lib/workspace-migration/migration-report.service.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy-evidence.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy.interface.ts`, `packages/core/src/lib/work-units/development-policy.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/cli.ts`, `packages/cli/src/index.ts`
- **Gate**: type
- acceptance:
  - "the migrator writes the policy resolveEffectivePolicy already resolved, with or without a GitHub remote"
  - "legacy fields and declared blocks are never rewritten"
  - "instructions, overview and work status say when the policy was adopted and written"

### S2 — Specs for parity and for never rewriting
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/tests/src/lib/development-policy/adopt.spec.ts`, `packages/core/tests/src/lib/development-policy/adoption-parity.spec.ts`, `packages/core/tests/src/lib/workspace-migration/development-policy.migrator.spec.ts`, `packages/core/tests/src/lib/workspace-migration/development-policy-evidence.spec.ts`
- **Gate**: none
- acceptance:
  - "the same undeclared repository yields one policy from the migrator, resolveEffectivePolicy, the served instructions and the guard's reader"
  - "the written config round-trips to the same effective policy"

## acceptance

- the migrator writes the policy resolveEffectivePolicy already resolved, with or without a GitHub remote
- legacy fields and declared blocks are never rewritten
- instructions, overview and work status say when the policy was adopted and written
- the written config round-trips to the same effective policy
