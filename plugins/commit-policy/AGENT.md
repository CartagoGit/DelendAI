# AGENT.md — plugin `plugins/commit-policy`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Commit-authority plugin: configurable identity, cadence and audit-trail policy wrapping the git plugin primitives. Off by default — opt in via plugins.commit-policy.options.

## Public API

- default
- CommitPolicyOptionsSchema
- buildReleaseBranch
- isReleaseBranch
- resolveAuthor
- commitWithGuard
- runCommitDriver
- runPushDriver
- appendAuditTrailer
- localizedString
- SUPPORTED_LOCALES
- createSliceListener
- readCurrentSliceSnapshot
- createThresholdTracker

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

- plugins/commit-policy/tests/integration/cross-agent.spec.ts
- plugins/commit-policy/tests/integration/cross-agent-real.spec.ts
- plugins/commit-policy/tests/src/lifecycle.spec.ts
- plugins/commit-policy/tests/src/index.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

