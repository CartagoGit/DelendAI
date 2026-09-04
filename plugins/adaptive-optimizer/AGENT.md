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

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_adaptive-optimizer_adaptive_facade` — 4,771 B total, 3,666 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_adaptive-optimizer_optimize_run` — 2,302 B total, 911 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

