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

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 9. Claim: plugins lack a comparable quality summary. I did not verify this claim beyond noting that the facts exist in separate generated places (plugin manifests, the managed catalog, preset metadata with measured costs, token budgets); no single per-plugin card gathers them. Not audited exhaustively.

## non-goals

- Gating releases on the card.
- Hand-written cards: the card is generated and checked for drift.

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
