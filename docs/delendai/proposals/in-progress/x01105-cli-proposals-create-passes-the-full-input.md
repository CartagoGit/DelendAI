---
id: x01105
title: "CLI proposals create passes the full input"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-11-21
last-transition-id: c67b0455-2a29-4377-aa6f-90ae6b66281d
last-correlation-id: c67b0455-2a29-4377-aa6f-90ae6b66281d
last-transition-from: ready
last-transition-at: 2026-11-21T00:37:38.264Z
---

# x01105 — CLI proposals create passes the full input

## goal

delendai proposals create builds the same full input as the MCP create_proposal tool in one command, so workers stop scripting the MCP tool.

## why

The CLI forwarded only title, kind, goal, track and slices. The scaffold refuses placeholder why and nonGoals, and slices carried no files or acceptance, so workers fell back to scripting the MCP tool.

## non-goals

- Changing the create_proposal tool or its input schema
- Interactive prompts

## slices

- global_gate: none

### S1 — Add why, non-goals and --from to proposals create
- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/proposals.ts`, `packages/cli/src/commands/groups/proposals.spec.ts`, `packages/cli/src/contracts/constants/help-translation.constant.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "packages/cli/src/commands/groups/proposals.spec.ts: proposals create maps --why, --non-goals and --from onto delendai_proposals_create_proposal"
  - "`bun run lint:cli:i18n` passes with the new flags summarised"

## acceptance

- packages/cli/src/commands/groups/proposals.spec.ts: proposals create maps --why, --non-goals and --from onto delendai_proposals_create_proposal
- `bun run lint:cli:i18n` passes with the new flags summarised
