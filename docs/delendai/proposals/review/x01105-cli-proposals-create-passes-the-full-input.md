---
id: x01105
title: "CLI proposals create passes the full input"
kind: fix
status: review
type: proposal
track: trust
date: 2026-11-21
last-transition-id: 2502b3aa-08d5-4b3b-8c4f-60c763c031dd
last-correlation-id: 2502b3aa-08d5-4b3b-8c4f-60c763c031dd
last-transition-from: in-progress
last-transition-at: 2026-11-21T00:46:11.381Z
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
- **Status**: review
- **Files**: `packages/cli/src/commands/groups/proposals.ts`, `packages/cli/src/commands/groups/proposals.spec.ts`, `packages/cli/src/contracts/constants/help-translation.constant.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "packages/cli/src/commands/groups/proposals.spec.ts: proposals create maps --why, --non-goals and --from onto delendai_proposals_create_proposal"
  - "`bun run lint:cli:i18n` passes with the new flags summarised"
- shipped-in: `8ad578e8e840`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- packages/cli/src/commands/groups/proposals.spec.ts: proposals create maps --why, --non-goals and --from onto delendai_proposals_create_proposal
- `bun run lint:cli:i18n` passes with the new flags summarised
