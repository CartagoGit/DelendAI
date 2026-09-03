# AGENT.md — plugin `plugins/proposals`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Proposals workflow + multi-agent (swarm) orchestration.

## Public API

- default
- registerProposalsStableTools
- PROPOSALS_STABLE_TOOL_SURFACE
- PROPOSAL_ADAPTIVE_FACADE_INTENTS
- listProposalAdaptiveFacadePaths
- DEFAULT_PATH_LAYOUT
- buildSwarmPaths
- PROPOSAL_STATUSES
- STATUS_TO_FOLDER
- PROPOSAL_STATUS_TRANSITIONS
- PROPOSAL_KINDS
- PROPOSAL_PREFIX_BY_KIND
- PROPOSAL_KIND_BY_PREFIX
- KIND_TO_DONE_SUBFOLDER

## Depends on

- @mcp-vertex/error-reporting
- @mcp-vertex/logs
- @mcp-vertex/quality
- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/proposals/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/proposals/tests/src/lib/adopt-apply.spec.ts
- plugins/proposals/tests/src/lib/adopt-orientation.spec.ts
- plugins/proposals/tests/src/lib/adopt-tool.spec.ts
- plugins/proposals/tests/src/lib/adopt.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `mcp-vertex_proposals_proposal_get` — 2,772 B total, 2,565 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)
- `mcp-vertex_proposals_proposal_adopt` — 2,606 B total, 2,090 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)
- `mcp-vertex_proposals_close_slice` — 2,488 B total, 1,786 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)

<!-- mcp-vertex:end agent-md -->

