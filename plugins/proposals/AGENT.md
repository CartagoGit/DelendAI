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
- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/proposals/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/proposals/tests/src/lib/shared/branch-status-engine.spec.ts
- plugins/proposals/tests/src/lib/shared/pending-integration-store.spec.ts
- plugins/proposals/tests/src/lib/shared/peer-review-log.spec.ts
- plugins/proposals/tests/src/lib/shared/peer-review-bypass-log.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

