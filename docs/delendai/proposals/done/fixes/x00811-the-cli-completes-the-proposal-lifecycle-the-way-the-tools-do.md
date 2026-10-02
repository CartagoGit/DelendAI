---
id: x00811
title: "The CLI completes the proposal lifecycle the way the tools do"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-01
last-transition-id: e8a6efa8-595d-489d-8719-99d947936cab
last-correlation-id: e8a6efa8-595d-489d-8719-99d947936cab
last-transition-from: review
shipped-in:
  - "c7ed36567e1a0a95c6e885d55b5c079e15477b82"
---

# x00811 — The CLI completes the proposal lifecycle the way the tools do

## Goal

Any agent on any host can close a slice and hand a proposal to review: an agent without the MCP tools runs the same lifecycle through the CLI, with the same actor, the same live-unit binding and the same review round as the tools give.

## why

An agent that fell back to the CLI could not finish a proposal. The root cause of the refusal: every CLI call is its own short-lived server process, and a lock claim recorded the pid of the process that took it. The next call reaped the claim as an orphan (its owner was gone), so `close_slice` found no active lock and no active current actor. Claims made through the CLI now belong to the agent (`holder: 'agent'`), carry no pid, and expire by heartbeat.

Symptoms that followed from it: `proposals close-slice` refused with "close requires an active current actor" even after a lock claim; `proposals transition <id> review` moved the proposal but took no `agent`, so no review round opened and reviewers never saw it; and neither command could name a `checkout`. The agent hand-edited a slice status, which is forbidden.

## Architecture

- `agent_lock` gains `holder: 'process' | 'agent'`; `agent` records no host or pid, so neither the session-close release nor the orphan sweep touches it. `proposals lock` claims by the agent and defaults the agent from `DELENDAI_AGENT_ID`.
- The CLI keeps calling the plugin tools through the server, so the handlers cannot diverge; only the arguments it maps were missing. `close-slice` gains `--checkout`; `transition` gains `--agent` (default `DELENDAI_AGENT_ID`) and `--checkout`.
- A call about a proposal made from the shared checkout acts in the caller's live unit through the same binding the tools already get (`bindWriteRoot`); the CLI passes the proposal so that binding can find it.
- A refusal names the missing input.

## non-goals

- Changing how the tools resolve a unit, or the validation-activity resolver (a detached worktree reading as corrupt activity is a separate fix).

## Slices

- global_gate: none

### S1 — close-slice, transition and lock claims work from the CLI
- **Status**: done
- **Files**:
  - `packages/cli/src/commands/groups/proposals.ts`
  - `packages/cli/src/commands/groups/group-helpers.ts`
  - `packages/cli/src/commands/groups/proposals.spec.ts`
  - `packages/cli/src/contracts/constants/help-translation.constant.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/agent-lock.interface.ts`
  - `plugins/proposals/src/lib/locks/execute-lock-action.ts`
  - `plugins/proposals/src/lib/tools/agent-lock.tool.ts`
  - `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`
- **Gate**: type
- shipped-in: `c7ed36567e1a`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — x00811 S1 - close-slice, transition and lock claims work from the CLI. commit c7ed36567e1a0a95c6e885d55b5c079e15477b82 adds packages/cli/src/commands/groups/{proposals.ts,group-helpers.ts,proposals.spec.ts}, packages/cli/src/contracts/constants/help-translation.constant.ts, plugins/proposals/src/lib/contracts/interfaces/agent-lock.interface.ts (agent-holder variant), plugins/proposals/src/lib/locks/execute-lock-action.ts, plugins/proposals/src/lib/tools/agent-lock.tool.ts. agent_lock now distinguishes holder: 'process' | 'agent'; the agent holder omits pid so the orphan sweep ignores it; CLI defaults agent from DELENDAI_AGENT_ID. gate: type. Repo typecheck has 4 pre-existing module-not-found errors; NONE in x00811-touched files. focused gate: vitest run packages/cli/src/commands/groups/proposals.spec.ts => 36/36 passed, exit 0. acceptance: close-slice accepts --checkout; transition accepts --agent (default DELENDAI_AGENT_ID) + --checkout; transition review --agent opens the round; refusal names missing input.

## acceptance

- `proposals close-slice` accepts `--checkout`; `proposals transition` accepts `--agent` (default `DELENDAI_AGENT_ID`) and `--checkout`.
- `proposals transition <id> review --agent=<who>` opens the review round.
- From the shared checkout and from inside a unit worktree, under shared-checkout-pr and shared-checkout-merge, the commands act in the right tree.
- A refusal names the missing input.
