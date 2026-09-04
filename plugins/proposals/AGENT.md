# AGENT.md — plugin `plugins/proposals`

> Below the `<!-- delendai:begin agent-md -->
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

- @delendai/error-reporting
- @delendai/logs
- @delendai/quality
- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/proposals/

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
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

