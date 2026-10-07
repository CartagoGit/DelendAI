# AGENT.md — package `packages/roadmap`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Versioned roadmap: entries with a kind and gates, a bump intent derived through the changelog plugin, a git-tracked authority file and an append-only timeline.

## Public API

- roadmapEntrySchema
- roadmapEstimateSchema
- roadmapGateSchema
- roadmapHorizonSchema
- roadmapSchema
- checkTransition
- legalTransitions
- promisedKinds
- validateBumpHints
- readRoadmap
- buildBumpIntent
- deriveBumpFromKinds
- inferBumpForKinds
- evaluateEntryGates

## Depends on

- @delendai/changelog
- zod

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/roadmap/tests/src/lib/bump/roadmap-bump-intent.service.spec.ts
- packages/roadmap/tests/src/lib/contracts/roadmap.schema.spec.ts
- packages/roadmap/tests/src/lib/gates/gate-evaluator.service.spec.ts
- packages/roadmap/tests/src/lib/state-machine/roadmap-state-machine.service.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

