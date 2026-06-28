---
id: f00078
status: done
type: proposal
track: swarm+coordination+governance
date: 2026-06-28
kind: feat
title: Coordination protocol enforcement — force worktrees, block on rescue candidates, integrate loop detector
shipped-in:
  - pending # S1 (needs-worktree gate) + S2 (hygiene-blocked gate) + S3 (loop-blocked gate) implemented in plugins/proposals/src/lib/tools/auto-work.tool.ts
recan: []
related:
  - f00073 # branch_status + branch_gc engines
  - f00075 # swarm hygiene routine (rescue / GC-eligible / out-of-cache) — S4 front-hook shipped in this same window
  - x00074 # loop detector guards (outcome-aware + cooldown + progress-aware)
  - c00012 # agents should not panic on peer commits (companion rule)
ownership:
  - { agent: implementation_runner, task: 'S1: auto_work blocks when no worktree exists (forces per-agent isolation) — IMPLEMENTED' }
  - { agent: implementation_runner, task: 'S2: auto_work blocks when rescueCandidates > 0 (no agent can proceed while another has unmerged work) — IMPLEMENTED via f00075 S4 front-hook' }
  - { agent: implementation_runner, task: 'S3: auto_work invokes loop detector on last 50 calls and returns loop-blocked on real stuck loops (x00074 integration) — IMPLEMENTED' }
  - { agent: implementation_runner, task: 'S4: agent_lock claim requires an existing worktree when agentWorktree gate is on (hard enforcement at the primitive) — PENDING' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run test,      expect: exit0 }
  - { command: bun run validate,  expect: exit0 }
---

# f00078 — Coordination protocol enforcement

## goal

Make the swarm coordination protocol **unenforced from the agents' side**,
not merely **documented in skill files**. Today the rules live in
`multi-agent-coordination/SKILL.md`, `AGENT-BOOTSTRAP.md § 4.b`, and the
c00012 governance note — but a sufficiently determined LLM can still
ignore them because there is no runtime gate. This proposal closes the
four escape routes that let any agent "do what it wants":

1. **No worktree ⇒ direct edits in the shared checkout.** S1 + S4 close it.
2. **Rescue candidates left unmerged.** S2 blocks `auto_work` on them.
3. **Loops that burn tokens before tripping.** S3 wires x00074 in.
4. **Tools called outside the protocol.** Out of scope for this slice;
   covered by the host-side gate (S4 only enforces at the primitive).

After this proposal lands, an agent that wants to do non-trivial work
**must** go through `auto_work` → `continue_proposal` → `delegate`,
have a worktree, and run the hygiene check before claiming a slice.
There is no "I'll just edit this one file" path that bypasses the
swarm primitives.

## why

The 2026-06-27 and 2026-06-28 sessions in `agent/copilot-minimax-m3` and
`agent/copilot-minimax-m3-s57` produced three concrete failure modes:

- An agent created work outside any worktree, leaving 8 modified + 3
  untracked files stranded in `.cache/.../`. (`f00073` raised the
  visibility; `f00075` added the rescue routine. But neither *prevents*
  the next agent from doing it again.)
- An agent in a non-trivial loop burned ~8 retries of `agent_lock
  claim` before the loop detector tripped the handoff packet. (`x00074`
  fixed the detector; this proposal wires it into `auto_work` so the
  brake fires **before** the cascade flips to a rescue proposal.)
- A different agent left 2 unique commits in
  `agent/copilot-minimax-m3-s57` (f00057 S11 work). The rescue hint
  existed in `branch_status`, but `auto_work` did not surface it as a
  blocker — the agent kept working on a new slice while f00057 S11
  sat in a worktree that any cleanup pass could have removed.

In every case the *tools* were correct. The gap was that `auto_work`
allowed the next slice to start before the previous slice's
consequences (rescue, GC, worktree) were resolved.

## why this design

- **Block, do not refuse.** Each new state adds a `nextAction` that
  resolves the block. An agent that follows the next action is back on
  the protocol in one round-trip.
- **Soft-then-hard.** S1 + S2 + S3 are advisory in `branch_status` /
  `branch_gc` / `swarm_hygiene`. S4 makes `agent_lock claim` refuse
  when no worktree exists — the last gate, because once an agent has
  a worktree the other gates have already done their job.
- **Run the loop detector in `auto_work` itself.** x00074 already
  detects. S3 just adds the call. No new module.
- **No regressions for solo work.** When `agentWorktree: false` (the
  default), all four guards are no-ops. Existing tests for the solo
  path continue to pass.

## non-goals

- Removing the `agentWorktree: true` gate. Some hosts run the host
  without per-agent worktrees by choice. This proposal enforces the
  protocol only when the gate is on.
- Forcing `commit-and-push` at slice close. The persist step is
  already a separate decision (f00073 S2, `auto_work` step).
- Replacing the `c00012` panic rule with an automated merge. Out of
  scope; this proposal only adds gates.
- Auto-running `branch_gc({ dryRun: false })`. The f00075 routine
  is observation-first by design.

## architecture

```
plugins/proposals/src/lib/tools/
  auto-work.tool.ts                      # MODIFY: 3 new states
                                         #   (needs-worktree,
                                         #    hygiene-blocked,
                                         #    loop-blocked)
                                         # wired into runAutoWork's
                                         # result paths
  agent-lock.tool.ts                     # MODIFY (S4): claim refuses
                                         #   when ctx.agentWorktreeEnabled
                                         #   and no worktree exists
plugins/proposals/src/lib/agents/
  agent-loop-detector.ts                 # NO CHANGE: x00074 already
                                         #   ships the guards
plugins/proposals/skills/
  multi-agent-coordination/SKILL.md      # UPDATE: section "Protocol
                                         #   enforcement (f00078)"
docs/mcp-vertex/AGENT-BOOTSTRAP.md       # NO CHANGE: c00012 § 4.b
                                         #   already documents the rule
docs/mcp-vertex/proposals/ready/
  f00078-coordination-protocol-enforcement.md   # this file
```

## slices

### S1 — `auto_work` blocks when no worktree exists

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`,
  `plugins/proposals/tests/src/lib/tools/auto-work.spec.ts` (new)

When `ctx.agentWorktreeEnabled === true` AND the active branch is
**not** of the form `agent/<name>` AND the call resolves a non-trivial
plan, return:

```jsonc
{
  "state": "needs-worktree",
  "reason": "agentWorktree gate is on; this session has no per-agent worktree",
  "nextAction": "proposals_agent_worktree { action: 'create', agent: '<active-agent>' }",
  "handoffPath": "...",
  "stop": true
}
```

The orchestrator cannot reach the plan until the worktree exists. The
`stop: true` is the new-protocol counterpart to a00033's idle-stop:
the agent has been told what to do, and re-calling `auto_work`
without doing it would be a loop.

- **Acceptance**:
  - When the active branch starts with `agent/`, `auto_work`
    continues with the existing plan path. No regression.
  - When the active branch is `develop` / `main` / detached and
    `agentWorktreeEnabled === true`, `auto_work` returns
    `state: 'needs-worktree'` with `stop: true`.
  - When `agentWorktreeEnabled === false` (default), the guard is a
    no-op.

### S2 — `auto_work` blocks when rescueCandidates > 0

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`,
  `plugins/proposals/tests/src/lib/tools/auto-work.spec.ts`

Call `proposals_swarm_hygiene { }` (already in disk) at the start of
`auto_work`. If `summary.rescueCandidatesCount > 0` AND the agent has
not acknowledged the rescue (`proposals_rescue_acknowledge { }`),
return:

```jsonc
{
  "state": "hygiene-blocked",
  "reason": "<N> rescue candidate(s) — branches with unmerged work ahead of develop",
  "nextAction": "proposals_rescue_acknowledge { branch: '<rescue[0].branch>' } then proposals_cherry_pick_rescue { branch: '<rescue[0].branch>' }",
  "rescueCandidates": [...],  // full payload from swarm_hygiene
  "stop": true
}
```

A new tool `proposals_rescue_acknowledge` (3 lines, Zod only) records
that the orchestrator has SEEN the rescue candidate. After
acknowledgement, `auto_work` proceeds. The acknowledgement is *not*
permission to discard the work — the next step in `nextAction` is the
cherry-pick.

- **Acceptance**:
  - When `rescueCandidatesCount === 0`, no-op.
  - When `> 0` and not acknowledged, `state: 'hygiene-blocked'`,
    `stop: true`, full payload in `rescueCandidates`.
  - When acknowledged for all listed candidates, proceed with the
    normal plan.
  - `branchHygieneHints` (f00075 S1) becomes redundant for the
    blocking case but stays as a 1-line reminder for the non-blocking
    case (e.g. GC-eligible without rescue).

### S3 — `auto_work` invokes the loop detector on the last 50 calls

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`,
  `plugins/proposals/tests/src/lib/tools/auto-work.spec.ts`

After the existing `loopDetector.isAgentStuck(...)` check, also run the
pure `detectAgentLoop` on a window the caller provides. The caller
collects the window via the `agent_lock` listener (already wired in
f00073). When the verdict is `isStuck: true`, return:

```jsonc
{
  "state": "loop-blocked",
  "reason": "loop detector fired on <tool>:<args-hash> with effectiveCount=<n>",
  "nextAction": "read the handoff packet at <handoffPath>; resolve the stuck call (different args, different tool, or backoff); then proposals_continue_proposal { mode: 'auto' }",
  "handoffPath": "...",
  "triggeredGuards": [...],
  "offendingTool": "...",
  "stop": true
}
```

- **Acceptance**:
  - x00074's `detectAgentLoop` is invoked once per `auto_work` call.
  - When `isStuck: false`, no-op.
  - When `isStuck: true`, `state: 'loop-blocked'`, `stop: true`,
    `triggeredGuards` + `offendingTool` exposed for observability.
  - The existing `loopDetector.isAgentStuck(...)` (M28 / a00033) stays
    — both detectors fire; whichever trips first wins.

### S4 — `agent_lock claim` refuses without a worktree

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/agent-lock.tool.ts`,
  `plugins/proposals/src/lib/locks/agent-lock-engine.ts`,
  `plugins/proposals/src/index.ts` (pass new deps),
  `plugins/proposals/tests/src/lib/tools/agent-lock.tool.spec.ts`

When `agentWorktreeEnabled === true` AND the call is
`action: 'claim'` AND the active branch is **not** of the form
`agent/<name>`, the engine refuses with a clear error:

```jsonc
{
  "ok": false,
  "error": "agent_lock claim requires a per-agent worktree when the host gate is on",
  "blockerType": "needs-worktree",
  "nextAction": "proposals_agent_worktree { action: 'create', agent: '<agent-name>' }",
  ...
}
```

The claim is **not** taken. The agent must create a worktree first,
then retry. After this slice of f00078, the only path to editing a
proposal slice in a gated host is via a `agent/<name>` worktree.

- **Acceptance**:
  - When the active branch starts with `agent/`, the claim proceeds
    normally. No regression.
  - When the active branch is `develop` and `agentWorktreeEnabled`,
    the engine refuses with `blockerType: 'needs-worktree'` and the
    nextAction above.
  - When `agentWorktreeEnabled === false` (default), no-op.
  - Detached HEAD + gated host: same refusal, distinct
    `nextAction` (`proposals_agent_worktree { action: 'create', ... }`
    works on detached HEADs too because the new branch is created
    from `HEAD`).

## acceptance

After landing S1..S4:

- An agent on `develop` in a gated host cannot start a slice.
  `auto_work` returns `needs-worktree`; `agent_lock claim` returns
  `blockerType: 'needs-worktree'`. The only escape is to create a
  worktree, which the `nextAction` spells out.
- An agent with rescue candidates in its workspace cannot start a
  new slice. `auto_work` returns `hygiene-blocked` with the full
  payload. `branchHygieneHints` becomes the at-a-glance signal for
  humans reading the response.
- An agent in a real loop cannot burn 8 retries before the brake
  fires. `auto_work` returns `loop-blocked` on the first call that
  detects the loop, with `triggeredGuards` so the next agent can
  debug instead of guessing.
- `bun run validate` is green; no regression on the solo path
  (`agentWorktreeEnabled === false`).

## risks and mitigations

- **Risk: S4 hard refusal breaks existing setups.** Hosts that have
  `agentWorktree: true` but use it loosely (worktrees are
  optional, not required) will see claim failures for the first
  time. **Mitigation:** the refusal message names the exact tool +
  args to run. The agent does not need to know the protocol; it
  reads the nextAction and follows it.
- **Risk: S2 hygiene-blocked creates a deadlock if rescue candidates
  are spurious.** A worktree with a branch that has ahead>0 but is
  actually empty (false positive from `branch_status`) would block
  all agents until acknowledged. **Mitigation:** the
  `proposals_rescue_acknowledge` step is *not* permission to drop —
  it is permission to proceed past the block. The cherry-pick hint is
  still there. Operators can also run `proposals_branch_gc { dryRun:
  true }` to inspect, then `proposals_rescue_acknowledge { branch:
  '<branch>', force: true }` if the rescue is a false positive.
- **Risk: S3 false positive blocks legitimate retry loops.** x00074
  added four guards but a future change might regress them.
  **Mitigation:** the S3 spec replays the 2026-06-27 8-claim false
  positive and asserts the loop is not flagged. If the regression
  spec ever fires, the S3 implementation is broken, not the proposal.
- **Risk: the four guards interact unexpectedly.** An agent on
  `develop` with a rescue candidate in a loop will see
  `needs-worktree` first (S1, S4) and never reach `hygiene-blocked`.
  That is the intended order. **Mitigation:** document the priority
  in the SKILL.

## notes

- The proposal builds on f00073 (`branch_status` + `branch_gc`),
  f00075 (`swarm_hygiene`), and x00074 (`loop detector`). All three
  are landed or in-disk. This proposal is the *integration* slice
  that turns three passive observers into four active gates.
- The `proposals_rescue_acknowledge` tool is a 3-line Zod schema +
  a single file write to the swarm registry. It exists only to
  record "the orchestrator has seen this rescue candidate" so S2
  does not block on the same candidate forever.
- This proposal does **not** add new MCP tools for cherry-pick,
  stash, or commit. Those exist (`proposals_commit_proposal`,
  `git cherry-pick` via shell). S2 just adds the *acknowledgement*
  tool; the operator still runs the cherry-pick manually.

## dependency graph

```
S1 ── independent
S2 ── independent (depends on f00075 being landed)
S3 ── independent (depends on x00074 being landed)
S4 ── independent (depends on S1 being landed, since they share the
     "active branch is not agent/*" check)
```

S1..S4 can land in any order. They share no file (S4 modifies
`agent-lock.tool.ts`, S1..S3 modify `auto-work.tool.ts`).