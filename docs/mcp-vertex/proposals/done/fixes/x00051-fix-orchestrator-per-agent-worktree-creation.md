---
id: x00051
status: done
type: proposal
track: plugins/proposals+git+orchestration
date: 2026-06-27
kind: fix
title: Orchestrator does not create per-agent worktrees — delegate and auto_work both bypass the agent_worktree gate, so concurrent subagents share the active branch
runner: copilot
model: minimax-m3
scope: swarm-orchestration
recan:
    - f00052 # gate agent_worktree behind host flag — provides the `enabled` knob this proposal reads
related:
    - f00057 # skill unification — same area; if both land, this proposal must run first
ownership:
    - { agent: implementation_runner, task: 'S1: extend IDelegateToolOptions with `worktree?: { enabled, workspaceRoot }`; when enabled, invoke runAgentWorktreeEngine{ action: "create", agent } BEFORE agent_lock claim; on worktree failure return stage "worktree" without claiming the lock' }
    - { agent: implementation_runner, task: 'S2: wire the new option in plugins/proposals/src/index.ts — read ctx.agentWorktreeEnabled + ctx.workspace.root and forward to buildDelegateRegistration' }
    - { agent: implementation_runner, task: 'S3: auto_work plan: when persist.mode !== "none" the first work step must explicitly call agent_worktree create (skip step if already exists / idempotent return)' }
    - { agent: implementation_runner, task: 'S4: add tests — orchestration.spec.ts delegates with worktree enabled and asserts the engine create call; auto-work.spec.ts asserts the plan contains an agent_worktree step when persist is commit or commit-and-push' }
    - { agent: proposal_guardian,    task: 'S5: update plugins/proposals/skills/proposals-workflow-playbook/SKILL.md "Persist Modes" section to reflect that delegate now owns worktree creation; remove the manual "create the worktree first" instruction' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,        expect: exit0 }
    - { command: bun run test,             expect: exit0 }
    - { command: bun run lint:tools,       expect: exit0 }
    - { command: bun run lint:proposals,   expect: exit0 }
    - { command: bun run validate,         expect: exit0 }
---

# x00051 — Orchestrator does not create per-agent worktrees

## goal

Make the swarm actually self-manage the branch isolation that
`mcp-vertex.config.json#agentWorktree: true` is supposed to provide. Today
two subagents spawned via `proposals_auto_work` → `proposals_delegate` end
up committing on **whatever branch the orchestrator has checked out** —
typically `agent/<host-session-name>` — because neither `auto_work` nor
`delegate` invokes `agent_worktree create`. The result is the "agents
fighting over the same branch" failure mode the user is reporting:

1. Agent A enters via `auto_work` → `delegate` → spawns agent `orion`.
2. `delegate` calls `agent_names assign` (gets `orion`) and `agent_lock
   claim` (gets the files). It does **not** create `agent/orion`.
3. Agent `orion` finishes its slice and persists with `commit-and-push`
   to `pushTarget: "origin agent/orion"` — but the worktree never
   existed, so the helper pushes whatever branch the orchestrator is on,
   i.e. `agent/copilot-minimax-m3`.
4. Agent B enters, gets a different name, hits the same surface, pushes
   to the same shared branch. Two concurrent subagents, two commits on
   the same branch, no isolation. The "Pattern 2 — Parallel
   implementation with isolated git history" documented in
   `multi-agent-coordination/SKILL.md` is unreachable from `auto_work`.

The fix makes `delegate` the **single chokepoint** for subagent
creation: it always assigns a name, always claims the lock, and
**always creates the worktree when the host has enabled the capability**
— in that order, atomically. `auto_work`'s plan then no longer asks the
agent to remember to call `agent_worktree create` manually before
persisting; the worktree is already there because `delegate` made it.

## why

### Where the bug lives (one paragraph per layer)

- **`delegate` handler** (`plugins/proposals/src/lib/tools/orchestration.tool.ts:165-217`)
  composes three engines — `runAgentNames` (assign symbolic name),
  `runAgentLockEngine` (claim files), and that's it. There is no git
  step. `IDelegateToolOptions` carries `agentNames` + `lockPathAbs`
  only — no `workspaceRoot`, no `enabled`, no way to reach
  `runAgentWorktreeEngine`.
- **`auto_work` plan** (`plugins/proposals/src/lib/tools/auto-work.tool.ts:215-260`)
  returns an 8-step recipe ending with "Persist the slice (commit +
  push) ... pushTarget: `origin agent/<branch>`". The `<branch>` token
  is never substituted and the steps before persist never tell the
  agent to call `agent_worktree create`. The agent has to know
  independently that the worktree must already exist — which it
  doesn't, because `delegate` didn't make it.
- **`agent_worktree`** (`plugins/proposals/src/lib/tools/agent-worktree.tool.ts`)
  is gated by `options.enabled` (f00052) — the host gate is honored
  correctly. The plumbing exists; it's just not wired into the
  delegation path.

### Why "just have the agent call it manually" is not enough

The skill `multi-agent-coordination/SKILL.md` says:

> "Pattern 2 — Parallel implementation with isolated git history:
> auto_work → continue_proposal → agent_worktree create → agent_lock
> claim → ..."

That sequence is **written in prose for the model to follow**. It is
not enforced anywhere in the tool surface. When `auto_work`'s plan
hands the agent a `delegate` recipe with no `agent_worktree create`
step, the agent does the obvious thing: it skips the worktree and
persists on the active branch. The error is invisible — `git push`
exits 0 because `origin agent/copilot-minimax-m3` does exist.

### What the fix is

Move the worktree-creation responsibility from the **prompt contract**
("remember to call agent_worktree first") to the **tool contract**
(`delegate` makes it impossible to skip). Concretely:

1. `delegate` reads an optional `worktree?: { enabled: boolean;
   workspaceRoot: string }` from its registration options.
2. When present and `enabled === true`, between the assign step and
   the lock step, it calls
   `runAgentWorktreeEngine({ action: "create", agent: <assigned-name> },
   { run, workspaceRoot })`. The same slug that the agent-name
   registry just assigned is the slug the worktree uses, so the
   branch always matches the name.
3. If the worktree engine returns `{ ok: false }`, `delegate` returns
   `stage: "worktree"` with the engine's `reason` and **does not
   claim the lock** — the worktree failure is treated as a hard
   prerequisite failure, like the assign failure today.
4. When the worktree option is absent or `enabled === false`,
   `delegate` behaves exactly as today (back-compat for hosts that
   keep the gate off).
5. `auto_work`'s plan gets a single new step — "Ensure worktree exists
   for `<agent-name>` (delegate handles this when
   `agentWorktree: true`)" — so the orchestrator that *isn't* going
   through `delegate` (e.g. when a human runs `auto_work` solo) still
   sees the explicit step.

The fix touches 3 files of code, 2 spec files, and 1 skill. No public
contract changes for hosts that don't enable the gate.

## non-goals

- **Not touching `agent_lock` semantics.** File ownership is the right
  primitive for in-flight concurrency; the worktree is git isolation.
  Keeping them separate preserves the existing "two agents, disjoint
  files" fast path.
- **Not adding a `merge` tool.** Bringing subagent branches back into
  the orchestrator's branch is still the user's job (via PR or local
  rebase). `delegate` should not silently merge — that would hide
  review. A future `proposals_sync_branches` may come, but it is out
  of scope for the bug at hand.
- **Not changing the agent-name pool.** Today's constellation pool
  (`andromeda`, `orion`, ...) is already slug-safe; `slug()` in
  `agent-worktree-engine.ts` is a no-op for these names. No renaming
  work needed.
- **Not wiring `agent_worktree` into `continue_proposal`.** The
  orchestration primitive already produces a `plan` and `delegate`;
  the worktree belongs in `delegate`, where the agent is born.

## slices

### S1 — extend `IDelegateToolOptions` and the handler

Files: `plugins/proposals/src/lib/tools/orchestration.tool.ts`.

- Add `readonly worktree?: { enabled: boolean; workspaceRoot: string;
  run?: IGitRunner }` to `IDelegateToolOptions`.
- Extend `DELEGATE_OUTPUT_SCHEMA` with `stage: z.enum(['assign',
  'worktree', 'lock']).optional()`.
- After the assign step, if `worktree?.enabled === true`, call
  `runAgentWorktreeEngine({ action: 'create', agent: assigned.agent_name
  }, { run: worktree.run ?? createGitRunner(worktree.workspaceRoot),
  workspaceRoot: worktree.workspaceRoot })`.
- If the engine returns `ok: false`, return
  `toolJson({ ok: false, stage: 'worktree', agent: assigned.agent_name,
  reason: result.reason, detail: result })`. **Do not claim the lock.**
- On success, continue to the existing lock step unchanged. Return
  `ok: true, worktree: { path, branch }` on the success payload so the
  orchestrator can `cd` there if needed.
- Update the `instruction` string to mention the worktree path when
  present: "Edit files in `${worktree.path}`; commit on branch
  `agent/<name>`".

### S2 — wire the new option in `plugins/proposals/src/index.ts`

File: `plugins/proposals/src/index.ts` (one block).

- The current `buildDelegateRegistration` call at line ~261 passes
  `agentNames` + `lockPathAbs`. Extend it to:

  ```ts
  buildDelegateRegistration({
    namespacePrefix: ctx.namespacePrefix,
    agentNames: agentNamesOptions,
    lockPathAbs: abs(layout.lockFile),
    ...(ctx.agentWorktreeEnabled === true
      ? {
          worktree: {
            enabled: true,
            workspaceRoot: ctx.workspace.root,
          },
        }
      : {}),
  })
  ```

- No other change at this call site. The `agent_worktree` tool is
  already registered with `enabled: ctx.agentWorktreeEnabled === true`
  (line 193), so the gate stays single-sourced.

### S3 — `auto_work` plan injects an explicit worktree step

File: `plugins/proposals/src/lib/tools/auto-work.tool.ts`.

- In the `steps` builder (~line 240), prepend a new step **before** the
  `delegate` step, only when `resolvedMode !== 'none'`:

  ```ts
  ...(resolvedMode !== 'none'
    ? [
        `Ensure per-agent worktree exists for the upcoming subagent: ${prefix}_agent_worktree { action: "create", agent: "<pending>" } (idempotent — returns the existing one if present; required when persist is "${resolvedMode}").`,
      ]
    : []),
  ```

- The literal `<pending>` is replaced by `delegate` with the assigned
  name; we keep it as a placeholder so the step is self-contained.
- Keep the existing persist step exactly as it is — its
  `pushTarget: "origin agent/<branch>"` will now actually exist.

### S4 — tests

Two new specs, one extended:

- `plugins/proposals/tests/src/lib/orchestration.spec.ts`:
  - New `it('creates a worktree when worktree.enabled is true and the
    host gate is on', ...)`: inject a fake `IGitRunner` that records
    calls, call `delegate`, assert the runner saw `['worktree', 'add',
    '-b', 'agent/<slug>', <path>, 'HEAD']` (or `add <path> <branch>`
    if the branch already exists — see the engine's logic at
    `agent-worktree-engine.ts:202-203`).
  - New `it('returns stage "worktree" without claiming the lock when
    worktree creation fails', ...)`: make the runner return
    `{ ok: false, reason: 'mock failure' }`; assert
    `out.ok === false, out.stage === 'worktree'` and that
    `agent_lock.json` is untouched.
  - New `it('does not invoke the worktree engine when worktree option
    is omitted (back-compat)', ...)`: existing assertion for
    `out.locked === true` still passes; spy runner sees zero worktree
    calls.
- `plugins/proposals/tests/src/lib/auto-work.spec.ts`:
  - Extend the `commit` and `commit-and-push` tests to assert the
    prepended worktree step is present and includes the literal
    `agent_worktree create`.
  - New `it('omits the worktree step when persist mode is "none"', ...)`:
    the existing default behaviour stays unchanged.
- (Optional, low-cost) `plugins/proposals/tests/src/lib/orchestration.spec.ts`:
  e2e-flavoured test that creates a real temp git repo, runs
  `delegate` with `worktree.enabled = true`, and asserts
  `git worktree list` shows `agent/<slug>` afterwards. Worth it because
  this is the regression we're guarding against — the unit-only path
  can't catch "the engine was called but produced a no-op".

### S5 — update `proposals-workflow-playbook`

File:
`plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`.

- In the "Persist Modes" section, replace the line "Do not push from a
  shared checkout without `agent_worktree` (when the host has enabled
  it)" with: "When `agentWorktree: true`, `delegate` creates the
  per-agent worktree automatically — you do **not** need to call
  `agent_worktree` yourself before `delegate`. When the host has not
  enabled the gate, commit to the active branch as today."
- Add a sentence in the "Decision Tree" comment block clarifying that
  `auto_work` → `delegate` is the canonical path to spawn a subagent
  with isolation; manual `agent_worktree` is reserved for the rare
  case where the orchestrator wants isolation without delegation
  (e.g. read-mostly investigation in a sidecar worktree).
- Update `multi-agent-coordination/SKILL.md`'s "Pattern 2" example to
  match the new flow: `auto_work → continue_proposal →
  proposals_delegate (which calls agent_worktree + agent_lock
  internally) → implement → close_slice → commit-and-push → release`.

## acceptance criteria

- `bun run validate` is green.
- `bun run lint:proposals` is green.
- `bun run test` passes the new `orchestration.spec.ts` cases and the
  extended `auto-work.spec.ts` cases.
- Manual smoke: with `agentWorktree: true` and `persist: commit-and-push`,
  running `delegate` in a clean repo creates
  `.worktrees/<slug>/` + branch `agent/<slug>` and the lock is held by
  the assigned name. Running it twice in a row is idempotent (second
  call returns the existing worktree, not a duplicate).
- Manual smoke: with `agentWorktree: false`, `delegate` behaves exactly
  as before the proposal — no worktree, no break.

## risks

- **Worktree path overlaps with an existing directory.** The engine
  already returns `ok: false` with a clear `reason` when
  `git worktree add` fails; we surface that as `stage: 'worktree'`.
  No silent fallback.
- **`slug()` divergence.** The agent-name pool returns kebab-case
  strings (`andromeda`); `slug()` in `agent-worktree-engine.ts:81-86`
  is a no-op for these. No risk for the default pool. If a host
  overrides `plugins.proposals.options.namePool` with mixed-case
  names, `slug()` collapses them to a stable lowercase branch name —
  the worktree branch and the agent-name may visually differ
  (e.g. `SkyWalker` → `skywalker`). Acceptable; documented behaviour.
- **Two delegates to the same agent.** When `delegate` is called twice
  with the same `taskId`, the second call hits the `assign` step's
  existing-blocked branch and returns `stage: 'assign'`. Worktree
  creation is not reached. No change in behaviour.
- **`auto_work` plan grows by one step.** Token-budget impact is one
  short imperative line — well under the `auto_work` measured budget
  per the `mcp-vertex-token-budget-playbook` skill.