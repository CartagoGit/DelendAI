---
id: x00811
title: "The CLI completes the proposal lifecycle the way the tools do"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-01
last-transition-id: f6e48262-aefa-488a-8be9-e0d5a91c048f
last-correlation-id: f6e48262-aefa-488a-8be9-e0d5a91c048f
last-transition-from: ready
---

# x00811 — The CLI completes the proposal lifecycle the way the tools do

## Goal

Any agent on any host can close a slice and hand a proposal to review: an agent without the MCP tools runs the same lifecycle through the CLI, with the same actor, the same live-unit binding and the same review round as the tools give.

## why

An agent that fell back to the CLI could not finish a proposal. `proposals close-slice` refused with "close requires an active current actor" even after a lock claim; `proposals transition <id> review` moved the proposal but took no `agent`, so no review round opened and reviewers never saw it; and neither command could name a `checkout`. The agent hand-edited a slice status, which is forbidden.

## Architecture

- The CLI keeps calling the plugin tools through the server, so the handlers cannot diverge; only the arguments it maps were missing. `close-slice` and `transition` gain `--agent` (default `DELENDAI_AGENT_ID`) and `--checkout`.
- A call about a proposal made from the shared checkout acts in the caller's live unit through the same binding the tools already get (`bindWriteRoot`); the CLI passes the proposal and agent so that binding can find it.
- A refusal names the missing input.

## non-goals

- Changing how the tools resolve a unit, or the validation-activity resolver.

## Slices

- global_gate: none

### S1 — close-slice and transition take agent and checkout
- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/groups/proposals.ts`
  - `packages/cli/src/commands/groups/proposals.spec.ts`
  - `packages/cli/src/contracts/constants/help-translation.constant.ts`
- **Gate**: type

## acceptance

- `proposals close-slice` and `proposals transition` accept `--agent` and `--checkout`; the agent defaults to `DELENDAI_AGENT_ID`.
- `proposals transition <id> review --agent=<who>` opens the review round.
- From the shared checkout and from inside a unit worktree, under shared-checkout-pr and shared-checkout-merge, the commands act in the right tree.
- A refusal names the missing input.
