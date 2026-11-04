---
id: f00807
title: "Each plugin has a generated quality card"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# f00807 — Each plugin has a generated quality card

## goal

A generated card per plugin states its version, capabilities, effects, tool count, registration token cost, specs and last regression.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The card is generated from manifests and measurements
- **Status**: pending
- **Files**: `tools/scripts/generate/plugin-quality-card.script.ts`
- **Gate**: type
- acceptance:
  - "The script writes one card per plugin with: version, capabilities, effects, tool count, registration token cost, number of specs and the last regression (the newest fix proposal naming the plugin); a spec renders one card from a fixture manifest."

### S2 — The card drifts loudly
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/plugin-quality-card-drift.script.ts`
- **Gate**: type
- acceptance:
  - "The lint fails when a card differs from its regeneration and is wired into validate:run."

## acceptance

- The script writes one card per plugin with: version, capabilities, effects, tool count, registration token cost, number of specs and the last regression (the newest fix proposal naming the plugin); a spec renders one card from a fixture manifest.
- The lint fails when a card differs from its regeneration and is wired into validate:run.
