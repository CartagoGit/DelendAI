# AGENT.md — plugin `plugins/perf`

> Below the `<!-- mcp-vertex:begin agent-md -->
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
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/perf/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/perf/tests/src/lib/bench/bench-comparator.spec.ts
- plugins/perf/tests/src/lib/bench/bench-runner.spec.ts
- plugins/perf/tests/src/lib/check-budgets.spec.ts
- plugins/perf/tests/src/lib/profile/real-perf-profile-deps.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

