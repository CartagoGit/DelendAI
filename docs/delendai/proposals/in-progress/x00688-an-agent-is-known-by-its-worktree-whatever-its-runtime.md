---
id: x00688
title: "An agent is known by its worktree, whatever its runtime"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00687, x00626, f00644]
---

# x00688 — An agent is known by its worktree, whatever its runtime

## goal

Every agent is held to the same rules, whatever model or host drives it.
In the worktree delendai made for its unit, whatever runs git is that
agent.

## why

The owner runs agents of several models (Claude, GLM, MiniMax) and saw
each work its own way. GLM's verdicts had to be rescued into batches by
hand. MiniMax moved 131 proposals into `done/` with `git mv`, deleted
five of its own work refs, and committed under invented authors
(`MiniMax-m3-review-20260926`).

The guard applies its rules to agents only (x00626: a person uses git
freely). It recognised an agent only by a variable in the shell:
`DELENDAI_AGENT_ID`, `AI_AGENT` or `CLAUDECODE`. Only Claude Code sets
one by itself. Every other runtime was judged as a person, and every
agent rule was skipped: no stash, the commit author, where commits go,
the shapes of branches it creates. Delendai governed one model, not a
swarm.

## why this design

- **The unit's worktree is the identity.** `work enter` makes the
  worktree an agent works in. It writes the agent's id into that
  worktree's own git directory (`delendai-agent`), which no other
  worktree shares. The guard reads it when no variable is set. This
  needs no configuration from any host, so it works for any runtime.
- **Older worktrees are recognised too.** A linked worktree checked out
  on a work branch belongs to the agent the branch names, so worktrees
  made before the stamp are covered.
- **The shared checkout is never stamped.** It is where a person works,
  and x00626 still holds there. The variables remain the way to identify
  an agent that works in the shared checkout.

## non-goals

- Recognising an agent that edits the shared checkout without any
  marker. It is where a person works, and nothing tells the two apart
  without a declaration.

## architecture

- `packages/cli/src/lib/worktree-agent.service.ts`: `stampWorktreeAgent`,
  `worktreeAgent`.
- `packages/cli/src/contracts/constants/worktree-agent.constant.ts`
- `packages/cli/src/commands/work.command.ts`: `work enter` stamps the
  worktree it makes or continues.
- `packages/cli/src/commands/guard.command.ts`: the actor is the
  variable, else the stamp, else the work branch's agent.
- `packages/cli/src/contracts/interfaces/guard.interface.ts`:
  `worktreeAgent`.

## Slices

- global_gate: none

### S1 — The worktree names its agent

- **Status**: in-progress
- **Gate**: `npx vitest run packages/cli/src/lib/worktree-agent.service.spec.ts packages/cli/src/commands/guard.command.spec.ts`
- **Files**:
  - `packages/cli/src/lib/worktree-agent.service.ts`
  - `packages/cli/src/lib/worktree-agent.service.spec.ts`
  - `packages/cli/src/contracts/constants/worktree-agent.constant.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`
  - `packages/cli/src/contracts/interfaces/guard.interface.ts`

## dependency graph

None.

## acceptance

- With no agent variable set, a commit on the integration branch is
  refused when the worktree names an agent, and allowed when it does not.
- In a linked worktree on `delendai/wip/<agent>/…` with no stamp, an
  agent rule (no stash) applies and names that agent.
- The shared checkout is never stamped.
