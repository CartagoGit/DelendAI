---
id: x01104
title: "The namespace ruleset guard tolerates exclusions the policy does not name yet"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: 0cc1333e-ae26-4d06-beae-7d7b05ec555d
last-correlation-id: 0cc1333e-ae26-4d06-beae-7d7b05ec555d
last-transition-from: ready
last-transition-at: 2026-11-21T00:19:20.559Z
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
- **Status**: pending
- **Files**: `tools/scripts/lint/namespace-ruleset-guard.script.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "An exclusion the live ruleset has and the policy does not name is printed as a warning and the guard exits 0"
  - "An exclusion the policy names and the live ruleset lacks still fails the guard"
  - "Inactive enforcement or a missing creation rule still fails the guard"
  - "--sync still writes the policy to the forge when only extra exclusions differ"

## acceptance

- An exclusion the live ruleset has and the policy does not name is printed as a warning and the guard exits 0
- An exclusion the policy names and the live ruleset lacks still fails the guard
- Inactive enforcement or a missing creation rule still fails the guard
- --sync still writes the policy to the forge when only extra exclusions differ
