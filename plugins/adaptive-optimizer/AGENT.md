# AGENT.md — plugin `plugins/adaptive-optimizer`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Adaptive optimizer: cheaply rank model, plugin-set and prompt candidates with explicit budget and consent guards.

## Public API

- default
- AdaptiveFacadeOutputSchema
- buildAdaptiveFacadeToolRegistration
- runAdaptiveFacade
- buildAdaptiveOptimizerToolRegistrations
- OptimizeRunOutputSchema
- runOptimizeRun
- buildActivationMetricsToolRegistration
- createActivationMetricsRegistry
- computePayloadPercentile
- scoreOptimizationCandidate

## Depends on

- @delendai/auto-agent-selector
- @delendai/auto-plugin-selector
- @delendai/perf
- @delendai/prompt-eval
- @delendai/proposals
- @delendai/usage-tracking
- @modelcontextprotocol/sdk
- zod

## Writes

- <host workspace>/.delendai/cache/adaptive-optimizer/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/adaptive-optimizer/src/lib/metrics/activation-metrics-registry.spec.ts
- plugins/adaptive-optimizer/tests/src/activation-metrics.tool.spec.ts
- plugins/adaptive-optimizer/tests/src/adaptive-facade.tool.spec.ts
- plugins/adaptive-optimizer/tests/src/optimization-scoring.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_adaptive-optimizer_adaptive_facade` — 4,589 B total, 3,533 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

