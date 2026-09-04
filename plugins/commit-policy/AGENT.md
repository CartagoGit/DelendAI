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
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/commit-policy/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/commit-policy/src/lib/branch-policy/index.spec.ts
- plugins/commit-policy/src/lib/engine.spec.ts
- plugins/commit-policy/src/lib/release-finalize/index.spec.ts
- plugins/commit-policy/tests/integration/cross-agent-real.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

