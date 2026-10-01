---
id: x00770
title: "Diagnostics and setup follow the configured profile"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-30
---

# x00770 — Diagnostics and setup follow the configured profile

## Goal

Every diagnostic and every setup step delendai performs in a consumer project reads the project's resolved development policy instead of assuming this repository's shape, so init followed by work status and doctor is correct for the merge and the pull-request profiles alike.

## why

An audit that drove the real CLI in throwaway repositories per profile found six places where delendai assumed its own layout: the workflow doctor flags every correct publication ref as flat (it counts three components, the shape has four); work status prints anchored yes under a profile that anchors nothing; doctor requires develop unprotected and main protected with ci-complete from a forge file; init installs no guard hooks and only prints to stderr, which hosts discard; init enables forge plugins in a project without a forge and writes host instructions pointing at a file it never scaffolds; and init with a pull-request profile leaves requiredChecks empty, so the next server start refuses and the host shows only a closed connection. The project's configuration is the single source of truth, so each of these reads it.

## non-goals

- Changing declare-workflow wording, push-driver, the proposals plugin or close_slice.
- Changing core development-policy validate, resolve or adopt, or making a single-branch policy legal (another proposal owns it).
- Weakening enforced-governance-needs-checks.

## Slices

- global_gate: none

### S1 — Publication shape from the policy template; anchored reads the policy
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/development-policy/work-ref-placeholders.ts`, `packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`, `packages/core/tests/src/lib/development-policy/work-ref-placeholders.spec.ts`
- **Gate**: none
- acceptance:
  - "A publication ref shaped agent/kind/proposal-slice-gN/topic is canonical; a flat one is not."
  - "work status says anchored is not required under a profile that does not anchor the checkout."

### S2 — Doctor reads branches and checks from the resolved policy
- **Status**: pending
- **Files**: `packages/cli/src/commands/doctor-checks/branch-protection.ts`, `packages/cli/src/lib/doctor/checks/branch-protection.check.ts`, `packages/cli/src/lib/doctor/checks/branch-protection.constant.ts`, `packages/cli/src/lib/doctor/checks/branch-protection.interface.ts`, `packages/cli/src/lib/doctor/checks/branch-protection.check.spec.ts`, `packages/cli/src/lib/doctor/checks/config.check.ts`, `packages/cli/src/lib/doctor/checks/index.ts`, `packages/cli/src/commands/doctor.spec.ts`
- **Gate**: none
- acceptance:
  - "Branch names and required checks come from the policy; observed governance never warns about a missing forge file; a project whose release branch is absent or equal to integration is checked once."

### S3 — Adoption gives a pull-request profile the checks it needs
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/development-policy.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy-adoption.interface.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy-required-checks.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy-required-checks.interface.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/workspace-migration/development-policy-required-checks.spec.ts`
- **Gate**: none
- acceptance:
  - "A pull-request profile is only adopted with requiredChecks derived from the project's declared workflow jobs; when none can be derived the merge profile is adopted and the reason is recorded."

### S4 — Init follows the project: profile block, plugins, hints, guard hooks
- **Status**: pending
- **Files**: `packages/cli/src/commands/init/init.command.ts`, `packages/cli/src/lib/init/init-development-setup.service.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/lib/init/init-human-summary.service.ts`, `packages/cli/src/lib/init/init-human-summary.service.spec.ts`, `packages/cli/src/contracts/interfaces/init.interface.ts`, `packages/cli/src/lib/init/init-workspace-start.spec.ts`, `packages/cli/src/lib/init/init-default.command.spec.ts`
- **Gate**: none
- acceptance:
  - "init writes the development block with its required checks, installs the guard hooks unless development.guardHooks is off, selects forge plugins only for a forge remote, and never references a file it does not write."
  - "For each profile the workspace init produced starts."

### S5 — A refused startup reaches the host as instructions
- **Status**: pending
- **Files**: `packages/core/src/lib/cli/refused-server.ts`, `packages/core/src/lib/cli/refused-server.constant.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/cli/refused-server.spec.ts`, `packages/cli/src/index.ts`, `packages/cli/src/index.spec.ts`
- **Gate**: none
- acceptance:
  - "When the server cannot start because the configuration cannot be honoured, an MCP client connects and reads the refusal and its remedy in the server instructions instead of a closed connection."

## acceptance

- A publication ref shaped agent/kind/proposal-slice-gN/topic is canonical; a flat one is not.
- work status says anchored is not required under a profile that does not anchor the checkout.
- Branch names and required checks come from the policy; observed governance never warns about a missing forge file; a project whose release branch is absent or equal to integration is checked once.
- A pull-request profile is only adopted with requiredChecks derived from the project's declared workflow jobs; when none can be derived the merge profile is adopted and the reason is recorded.
- init writes the development block with its required checks, installs the guard hooks unless development.guardHooks is off, selects forge plugins only for a forge remote, and never references a file it does not write.
- For each profile the workspace init produced starts.
- When the server cannot start because the configuration cannot be honoured, an MCP client connects and reads the refusal and its remedy in the server instructions instead of a closed connection.
