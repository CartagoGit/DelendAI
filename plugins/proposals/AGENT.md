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

- @delendai/state
- @delendai/proposals-sqlite
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

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_proposals_proposals_close_plan` — 3,405 B total, 2,579 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_proposals_close_slice` — 3,231 B total, 2,199 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_proposals_proposal_transition` — 3,127 B total, 1,810 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_proposals_agent_lock` — 3,125 B total, 2,449 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

