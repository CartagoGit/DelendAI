---
id: x00868
title: "CLI and MCP allocate proposal ids from one source, and CLI claims outlive the process"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-01
last-transition-id: 89f6828f-9c48-4ac4-b3f2-7720769a0953
last-correlation-id: 89f6828f-9c48-4ac4-b3f2-7720769a0953
last-transition-from: in-progress
shipped-in:
  - "f6e9d5c2d"
---

# x00868 — CLI and MCP allocate proposal ids from one source, and CLI claims outlive the process

## Goal

Make the proposals CLI complete every workflow an MCP agent can: ids come from one source that sees every worktree and ref whatever the cwd, create does not hang or leave orphans on retry, every CLI claim is held by the agent not the one-shot process, the agent is derived from the unit ref, and close-slice/transition are proved against a real server.

## why

The owner's principle is that every workflow is completable by any agent on any host, the CLI included. An agent driving only `delendai proposals` hit four breaks in one session:

1. `proposals create` timed out at 60 s twice, and each attempt had still written a proposal, with ids (`x09903`, `x09904`) far from the real sequence.
   - Cause of the slowness: the server's own root is the unit worktree, but `create_proposal` only recognised a unit when the caller passed `checkout`. Unrecognised, it pushed the file to a publication ref, and that push runs the full pre-push gate (about a minute). The client gave up first and the file stayed.
   - Cause of the retry litter: nothing recognised the earlier write, so each retry allocated a new id.
   - Cause of the out-of-sequence ids: a throwaway simulation branch on the remote legitimately holds `x09901` and `x09902`, so the allocator rightly refused to reuse them. But `git ls-tree` reads a repository-relative pathspec relative to the cwd, so a process running inside the proposals directory (the CLI's server) could not see ANY remote ref, while the MCP server at the repository root could. Two callers saw different held ids.
   - Cause of a real collision across sessions (`x00811` was handed to two proposals): every view the allocator consulted (counter, worktrees, fetched refs) is local, so two clones or machines allocating in the same minute cannot see each other. Only the remote can arbitrate, so the allocator now claims each id there first.
2. A claim made through `proposals delegate` or `proposals continue --mode=claim` was stamped with the pid of the short-lived serve process and swept when the CLI exited. `proposals lock` had been fixed; the others had not.
3. The CLI could not take the agent from the unit it runs in, though the work-ref template carries it.
4. The real-server behaviour of `close-slice` and `transition` was never proved, only their flag mapping against a stub.

## non-goals

- Deleting the simulation branches that hold `x09901`/`x09902`, or lowering the shared id counter: both belong to the owner. The allocator is right to honour them.
- Changing core's public surface, the swarm validation-activity resolver, generated-file merge handling, or the work-units publish/checkpoint path.
- Skipping the pre-push gate for a proposal publication.

## Slices

- global_gate: none

### S1 — Proposal ids: every process sees the same held ids, and two sessions cannot take one
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/proposal-id-sources.ts`, `plugins/proposals/src/lib/proposals/proposal-id-allocator.ts`, `plugins/proposals/src/lib/contracts/interfaces/proposal-id-sources.interface.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-id-sources.spec.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-id-allocator.spec.ts`
- **Gate**: none
- acceptance:
  - "ls-tree of remote refs finds proposals whatever directory the server runs in"
  - "an id is claimed on the remote as a ref of its own before it is handed out, atomically: of two clones reserving one id exactly one is told reserved, and the allocator steps over a taken one"
  - "a spec against a real repository shows a remote-held id is honoured from inside the proposals directory"
- shipped-in: `26da5edf1275`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at f6e9d5c2d, validate exit 0, tests 40/40 — Delivered by #724 (merge f6e9d5c2d). Proposals specs 40/40 and CLI group specs 53/53 pass.

### S2 — create_proposal does not block on a publish and is safe to repeat
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/proposals/existing-proposal.ts`, `plugins/proposals/src/lib/contracts/interfaces/existing-proposal.interface.ts`, `plugins/proposals/tests/src/lib/create-proposal-retry.spec.ts`, `plugins/proposals/tests/src/lib/tools/create-proposal-publishes.spec.ts`
- **Gate**: none
- acceptance:
  - "a server whose own root is a unit writes the proposal there and pushes nothing"
  - "a repeated create with the same title returns the proposal already on disk instead of a new id"
- shipped-in: `7562b1249fd9`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at f6e9d5c2d, validate exit 0, tests 40/40 — Delivered by #724 (merge f6e9d5c2d).

### S3 — Every CLI claim outlives the CLI process
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/orchestration.tool.ts`, `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`, `packages/cli/src/commands/groups/proposals.ts`, `packages/cli/src/commands/groups/proposals.spec.ts`
- **Gate**: none
- acceptance:
  - "delegate and continue --mode=claim take holder agent from the CLI"
  - "a claim made through either is still held after the CLI process has exited"
- shipped-in: `26da5edf1275`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at f6e9d5c2d, validate exit 0, tests 53/53 — Delivered by #724 (merge f6e9d5c2d).

### S4 — The CLI derives the agent from the unit ref
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/group-helpers.ts`, `packages/cli/src/commands/groups/group-helpers.spec.ts`
- **Gate**: none
- acceptance:
  - "the agent is the --agent flag, then DELENDAI_AGENT_ID, then the agent segment of the checkout's work ref"
- shipped-in: `26da5edf1275`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at f6e9d5c2d, validate exit 0, tests 53/53 — Delivered by #724 (merge f6e9d5c2d).

### S5 — Real-server specs for the CLI lifecycle
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/proposals.real-server.spec.ts`
- **Gate**: none
- acceptance:
  - "close-slice and transition run against a spawned server from a unit worktree and from the shared checkout, under shared-checkout-pr and shared-checkout-merge"
- shipped-in: `26da5edf1275`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at f6e9d5c2d, validate exit 0, tests 53/53 — Delivered by #724 (merge f6e9d5c2d).

## acceptance

- ls-tree of remote refs finds proposals whatever directory the server runs in
- an id is reserved atomically on the remote before it is handed out
- a server whose own root is a unit writes the proposal there and pushes nothing
- a repeated create with the same title returns the proposal already on disk instead of a new id
- delegate and continue --mode=claim take holder agent from the CLI, and the claim outlives the process
- the agent is the --agent flag, then DELENDAI_AGENT_ID, then the work ref's agent segment
- close-slice and transition are proved against a spawned server from a unit worktree and from the shared checkout, under both profiles
