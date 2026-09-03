# AGENT.md — plugin `plugins/adaptive-optimizer`

> Below the `<!-- mcp-vertex:begin agent-md -->
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

- @mcp-vertex/auto-agent-selector
- @mcp-vertex/auto-plugin-selector
- @mcp-vertex/perf
- @mcp-vertex/prompt-eval
- @mcp-vertex/proposals
- @mcp-vertex/usage-tracking
- @modelcontextprotocol/sdk
- zod

## Writes

- <host workspace>/.mcp-vertex/cache/adaptive-optimizer/

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
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `mcp-vertex_adaptive-optimizer_adaptive_facade` — 4,771 B total, 3,666 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)
- `mcp-vertex_adaptive-optimizer_optimize_run` — 2,302 B total, 911 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)

<!-- mcp-vertex:end agent-md -->

