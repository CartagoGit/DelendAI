# AGENT.md — plugin `plugins/prompt-eval`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Prompt-eval harness (golden prompts, scoring).

## Public API

- runEvalHarness
- scoreProvider
- scoreReport
- scorePerTaskType
- attemptsToOutcomeRecords
- MIN_PROMPT_EVAL_CALIBRATION_SAMPLES
- summarizeWinRates
- writeOutcomes
- buildEvalReportToolRegistration

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core
- @mcp-vertex/auto-agent-selector
- @mcp-vertex/orchestrator-runner

## Writes

- <host workspace>/.mcp-vertex/cache/prompt-eval/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

_(none)_

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

