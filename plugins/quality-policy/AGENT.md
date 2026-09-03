# AGENT.md — plugin `plugins/quality-policy`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands.

## Public API

- default
- buildQualityPolicyToolRegistrations
- QualityPolicyOutputSchema
- runQualityPolicy

## Depends on

- @mcp-vertex/conventions
- @mcp-vertex/quality
- @mcp-vertex/rules
- @mcp-vertex/test-convention
- @mcp-vertex/test-policy
- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/quality-policy/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/quality-policy/tests/src/lib/services/quality-policy-format.service.spec.ts
- plugins/quality-policy/tests/src/quality-policy.tool.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

