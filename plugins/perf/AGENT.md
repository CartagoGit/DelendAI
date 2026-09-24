# AGENT.md — plugin `plugins/perf`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Performance bench/bundle/profile tools.

## Public API

- checkBudgets
- formatBytes
- totalBytes
- realPerfDeps
- realPerfProfileDeps
- runProfileCapture

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/perf/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/perf/src/lib/tools/perf-bundle.tool.spec.ts
- plugins/perf/tests/src/lib/bench/bench-comparator.spec.ts
- plugins/perf/tests/src/lib/bench/bench-runner.spec.ts
- plugins/perf/tests/src/lib/check-budgets.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

