# AGENT.md — plugin `plugins/error-reporting`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Automatic mcp-vertex error reporting: opens de-duplicated GitHub issues for internal failures after explicit opt-in.

## Public API

- default
- OptionsSchema
- DEFAULT_BACKOFF_BASE_MS
- DEFAULT_BACKOFF_JITTER_RATIO
- DEFAULT_BACKOFF_MAX_MS
- DEFAULT_CIRCUIT_BREAKER_THRESHOLD
- DEFAULT_LABELS
- DEFAULT_MAX_ISSUES_PER_DAY
- DEFAULT_TARGET_REPO
- DEFAULT_DEDUPE_WINDOW_HOURS
- ERR_REPORTING_OPTION_DEPRECATED
- resolveOptions
- SAFE_REPORTER_FAILURE_CODES
- classifyInternalError

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/error-reporting/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/error-reporting/tests/frame-extractor.spec.ts
- plugins/error-reporting/tests/funnel-counter-store.spec.ts
- plugins/error-reporting/tests/funnel-reconciliation.spec.ts
- plugins/error-reporting/tests/index.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

