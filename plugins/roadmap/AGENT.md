# AGENT.md — package `packages/roadmap`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Versioned roadmap: what each target version promises, what is delivered, whether it can be promoted, and the bump its promises imply.

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
- @delendai/core
- @delendai/state
- yaml
- zod

## Writes

- <host workspace>/.delendai/cache/roadmap/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/roadmap/tests/property/roadmap-incremental-equals-rebuild.spec.ts
- plugins/roadmap/tests/src/index.spec.ts
- plugins/roadmap/tests/src/lib/bump/roadmap-bump-intent.service.spec.ts
- plugins/roadmap/tests/src/lib/contracts/roadmap.schema.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

