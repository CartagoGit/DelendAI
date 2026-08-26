# AGENT.md — plugin `plugins/commit-policy`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Commit-authority plugin: configurable identity, cadence and audit-trail policy wrapping the git plugin primitives. Off by default — opt in via plugins.commit-policy.options.

## Public API

- default
- CommitPolicyOptionsSchema
- resolveAuthor
- runCommitDriver
- runPushDriver
- appendAuditTrailer
- localizedString
- SUPPORTED_LOCALES
- createSliceListener
- readCurrentSliceSnapshot
- createThresholdTracker
- createIntervalTimer
- manualTrigger
- findTrigger

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/commit-policy/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/commit-policy/tests/src/lifecycle.spec.ts
- plugins/commit-policy/tests/src/e2e/dogfood.spec.ts
- plugins/commit-policy/tests/src/lib/services/push-scheduler.spec.ts
- plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts
- plugins/commit-policy/tests/src/lib/services/scope.spec.ts
- plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

