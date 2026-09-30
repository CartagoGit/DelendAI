---
id: x00771
title: "The served work model is derived from the resolved policy for every profile"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-30
priority: P1
related: [x00760]
last-transition-id: d2ada3f9-5ec7-4fe2-b2ca-5f6c197949a3
last-correlation-id: d2ada3f9-5ec7-4fe2-b2ca-5f6c197949a3
last-transition-from: ready
---

# x00771 — The served work model is derived from the resolved policy for every profile

## Goal

Every sentence an agent is served about how work starts, is certified and
lands comes from the resolved development policy and is true for the
profile in force: no profile is told about a mechanism it does not have.

## why

An audit that drove the real CLI and MCP in throwaway repositories, one
per profile, found the served text wrong in several places:

- `shared-checkout-merge` and `shared-direct` were told "a proposal lands
  one pull request per slice"; `shared-direct` was told its branch commits
  are squashed and DISCARDED, and that startup reconciliation preserves
  unmerged work although its recovery strategy is `none`.
- The gate sentence spoke of forge approvals and required checks under a
  profile whose only gate is the local validation gate, or none.
- `deriveCapabilities` computed `requiresLocalCertification` from the
  strategy alone, silently overriding the `true` that `shared-checkout-pr`
  declares, so this very repository was told "Certification happens on the
  forge, not on your machine".
- The `work` tool description, the post-merge guard remedy, a doctor
  remedy and the review command's hand-off said "pull request" under every
  profile.

## why this design

- Each declaration step is a table keyed by the landing route
  (`pull-request`, `merge`, `direct`), the same shape the land and start
  routes already have, so no route inherits another's wording.
- The declared certification value wins where the strategy leaves a
  choice (`pull-request`); it is forced only where the strategy dictates
  the answer (`merge` always certifies locally, `direct` never does).
  The value had no other consumer that relied on the override.
- The `work` tool takes the resolved policy at registration and renders
  the publish sentence from it; without one it stays neutral.
- The fixed eight positions of the declaration are kept: an inapplicable
  step says so truthfully instead of disappearing.

## non-goals

- The `mergeMethod: squash` value the `shared-direct` preset carries: no
  sentence reads it under `direct` any more, and its branch-protection
  meaning belongs to the governance work.
- Single-branch and release handling in policy validate, resolve and adopt.

## Slices

- global_gate: none

### S1 — Derive the served work model per landing route
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/declare-workflow.ts`, `packages/core/src/lib/development-policy/derive.ts`, `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/contracts/interfaces/work-unit-context.interface.ts`, `packages/core/src/lib/tools/work-unit.tool.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/commands/review.command.ts`, `packages/core/tests/src/lib/development-policy/declare-workflow.spec.ts`, `packages/core/tests/src/lib/development-policy/derived-invariants.spec.ts`, `packages/core/tests/src/lib/tools/work-unit.tool.spec.ts`
- **Gate**: none

## acceptance

- For each built-in profile no served sentence names a mechanism the
  profile does not have (per-profile table specs).
- `shared-checkout-pr` is told certification happens before publishing.
- The `work` tool description follows the policy it was registered with.
