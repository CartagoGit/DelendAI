# AGENT.md — plugin `plugins/prompt-eval`

> Below the `<!-- delendai:begin agent-md -->
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
- @delendai/core
- @delendai/auto-agent-selector
- @delendai/orchestrator-runner

## Writes

- <host workspace>/.delendai/cache/prompt-eval/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/prompt-eval/src/index.spec.ts
- plugins/prompt-eval/src/lib/calibrate/write-through.spec.ts
- plugins/prompt-eval/src/lib/eval/eval-harness.spec.ts
- plugins/prompt-eval/src/lib/score/score.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

