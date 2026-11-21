---
id: x01104
title: "The namespace ruleset guard tolerates exclusions the policy does not name yet"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-21
last-transition-id: 703e4755-639e-4328-bc60-d866bfdafd25
last-correlation-id: 703e4755-639e-4328-bc60-d866bfdafd25
last-transition-from: in-progress
last-transition-at: 2026-11-21T00:31:21.661Z
---

# x01104 — The namespace ruleset guard tolerates exclusions the policy does not name yet

## goal

A forge ruleset that allows a superset of the policy's namespaces passes lint:namespace-ruleset with a warning, so the ruleset can be widened before a branch-namespace change lands without turning every other pull request red.

## why

f00808 renames delendai's own branch namespaces. Its pull request fails ref-lifecycle because the live ruleset lacks the new names, but adding them first makes develop's guard fail every other pull request, since the guard treats an exclusion the policy does not name as an error. An extra exclusion only allows more than the policy; the stray-ref detector in ref-lifecycle still catches any branch outside the policy, so a warning is enough.

## non-goals

- Relaxing missing exclusions, inactive enforcement or a missing creation rule: those still fail.
- Changing the forge-governance wrapper or the ruleset itself.

## slices

- global_gate: none

### S1 — Extra ruleset exclusions warn; missing ones still fail
- **Status**: review
- **Files**: `tools/scripts/lint/namespace-ruleset-guard.script.ts`, `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/governance/forge-settings.lib.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "forge-settings.lib.spec.ts shows an exclusion the live ruleset has and the policy does not name reported as a warning, not a problem, so the guard exits 0"
  - "forge-settings.lib.spec.ts shows an exclusion the policy names and the live ruleset lacks reported as a problem, so the guard fails"
  - "forge-settings.lib.spec.ts shows inactive enforcement and a missing creation rule reported as problems"
  - "`bun tools/scripts/lint/namespace-ruleset-guard.script.ts --sync` writes the policy to the forge when only extra exclusions differ"
- shipped-in: `9f03aefe0ac9`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- forge-settings.lib.spec.ts shows an exclusion the live ruleset has and the policy does not name reported as a warning, not a problem, so the guard exits 0
- forge-settings.lib.spec.ts shows an exclusion the policy names and the live ruleset lacks reported as a problem, so the guard fails
- forge-settings.lib.spec.ts shows inactive enforcement and a missing creation rule reported as problems
- `bun tools/scripts/lint/namespace-ruleset-guard.script.ts --sync` writes the policy to the forge when only extra exclusions differ
