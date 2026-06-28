---
id: f00082
status: ready
type: proposal
track: swarm+coordination+governance+observability
date: 2026-06-28
kind: feat
title: Composite agent identity — every agent carries (host, model, agent_name, slot, proposal)
shipped-in: []
recan: []
related:
  - f00078 # coordination protocol enforcement — depends on a stable per-agent identity
  - f00081 # namespace-aware client services — orthogonal (this proposal is per-agent, not per-namespace)
  - a00045 # post-merge audit that surfaced the namespace hardcoding
  - c00012 # governance companion — peer commits
ownership:
  - { agent: implementation_runner, task: 'S1: define the IAgentIdentity interface and the slug-safe formatters (host/model/task_id)' }
  - { agent: implementation_runner, task: 'S2: extend IAgentAssignment with host + model + task_id and migrate the registry' }
  - { agent: implementation_runner, task: 'S3: pass host + model + task_id through agent_names / agent_lock / delegate so the registry fills them in' }
  - { agent: implementation_runner, task: 'S4: surface the identity in the agent_lock payload, the worktree branch name, and the handoff packet' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run test,      expect: exit0 }
  - { command: bun run validate,  expect: exit0 }
---

# f00082 — Composite agent identity

> **Status (2026-06-28, post-f00086):** the design is the same; the
> branch-name format and the collision-suffix policy were refined
> after the 28-Jun incident where two `copilot-minimax-m3` agents
> landed on the same `agent/copilot-minimax-m3` branch. The user
> trigger was *"si lanzo muchos agentes del mismo tipo, van a crear
> todos la rama con el mismo nombre....deberian estar numerados, o
> por tareas"*. Changes from the original version are marked **(R)**
> in the lines below.

## goal

Today, "an agent" is identified by `agent_name` (a constellation from
the pool: `andromeda`, `orion`, `vela`, ... plus the host pair
`{extension}-{modelo}` like `copilot-minimax-m3` that the user picks
manually). Two `copilot-minimax-m3` sessions opened at the same time
both try to create `agent/copilot-minimax-m3` and collide. That is
the trigger: the user wants the branch to be **numbered or by task**.

This proposal attaches **two additional fields** to every agent
identity: `host` (which IDE/CLI) and `model` (which LLM), and uses
the **current `task_id`** as the disambiguator instead of random
hex. The composite branch name becomes
`agent/<host>-<model>-<agent_name>-<task_id>` **(R)** and a
**numeric suffix** is appended when the same composite would collide
with an existing branch. The numeric suffix uses a small per-`task_id`
counter (1, 2, 3, …) so a sequence of agents on the same task is
predictable, not random.

## why

The user complaint that triggered this slice: "como saben que agente
es cada uno?", and the 2026-06-28 follow-up: "si lanzo muchos
agentes del mismo tipo, van a crear todos la rama con el mismo
nombre". Today the answer is "they're not" — the registry keeps the
constellation/host pair but discards the context that made the work
attributable in the first place. With three agents from three
different hosts working on three proposals at the same time, the
working tree becomes a soup of `agent/copilot-minimax-m3` branches
with no way to tell which one is which.

The composite fields also make the swarm tools (f00073/75/78) more
useful: `proposals_swarm_hygiene` can group rescue candidates by
`host+model` (a model with a high rescue rate is a model to debug),
`proposals_branch_gc` can keep the last-N worktrees per host instead
of globally, and `agent_loop_detector` can weight reclaims differently
for different models (an o1 retry is expected, a gpt-4-mini retry is
a loop).

## why this design

- **Four fields, not five.** The original draft had a fifth
  `agent_slot` in the branch; the 28-Jun review dropped it because
  the slot is a contract (`orchestrator`, `implementation_runner`, …)
  that any tool can read from the registry, not a name humans need
  on a branch. **(R)**
- **`<task_id>` is the disambiguator, not a random hex.** The user
  said "numerados, o por tareas" — using `task_id` (the proposal the
  agent is working on) is the cheapest and most informative option.
  When two agents on the same `<host>-<model>-<agent_name>-<task_id>`
  exist (rare but possible — the same host running two sessions on
  the same proposal), the engine appends a numeric suffix
  `…-f00078-1`, `…-f00078-2`, …, derived from a per-`task_id`
  counter in the registry. **(R)**
- **The four-field identity is the worktree branch name** when the
  host has the `agentWorktree` gate on.
  `agent/copilot-minimax-m3-orion-f00078` is the new format. **(R)**
- **Backwards compatible.** When the caller does not pass
  `host`/`model`/`task_id`, the engine falls back to
  `agent/<agent_name>` (the historical default). Old agents that
  only pass `agent_name` keep working.
- **Slug-safe formatters.** Hosts and models have spaces, dots,
  colons, slashes. The formatters normalise to `[a-z0-9-]` and cap
  length at 24 chars per field to keep the composite branch name
  under 92 chars total (POSIX ref-name limit is 255; we leave
  headroom for branch-protection prefixes and the numeric suffix). **(R)**
- **No new authority.** The composite identity is **derived**, not
  enforced — any host can lie about its model. The loop detector
  and the swarm tools do not reject mismatches; they just record
  them. The user gets forensics, not security.

## non-goals

- **No authentication.** A misbehaving host can still claim to be
  `claude-3-5-sonnet` while running on a different model. The
  composite identity is for forensics, not for trust. (A separate
  audit/proposal could add a signed-token model; out of scope here.)
- **No automatic cost attribution.** Cost is the host's
  responsibility; this proposal only records which model name was
  used. Actual cost reporting stays in the IDE's own telemetry.
- **No new registry file.** The same `subagent-registry.json`
  holds the new fields; we extend, we do not fork.
- **No changes to the constellation pool.** `orion` and friends
  keep their symbolic purpose. The pool is a human-friendly
  handle; the composite is the auditable identity.

## architecture

```
packages/core/src/lib/contracts/interfaces/agent-identity.ts  # NEW
  IAgentIdentity + IAgentHost + slug-safe formatters
plugins/proposals/src/lib/shared/agent-identity.ts            # NEW
  composeIdentity / parseIdentity / nextCollisionSuffix
plugins/proposals/src/lib/shared/agent-registry-store.ts     # MODIFY
  IAgentAssignment + IAgentIdentity merge
  upsert() accepts the new fields
plugins/proposals/src/lib/agents/agent-names.tool.ts         # MODIFY
  action: "assign" takes host + model + task_id
plugins/proposals/src/lib/tools/agent-lock.tool.ts           # MODIFY
  payload echoes identity (host, model, agent_name, task_id)
plugins/proposals/src/lib/tools/delegation/orchestration.tool.ts # MODIFY
  delegates carry host + model + task_id into the assigned agent
plugins/proposals/src/lib/agents/agent-worktree-engine.ts    # MODIFY (S4)
  branch name uses the composite slug when caller passes
  host/model/task_id; falls back to agent/<agent_name> otherwise
plugins/proposals/src/lib/agents/agent-worktree.tool.ts      # MODIFY (S4)
  tool inputSchema gains host/model/task_id (all optional)
plugins/proposals/src/lib/handoff/handoff-packet.ts          # MODIFY
  identity is the first section of the handoff JSON
plugins/proposals/skills/multi-agent-coordination/SKILL.md  # UPDATE
  section "Agent identity (f00082)" — what each host must pass
```

## slices

> **Priority (R):** S1 + S4 are the **minimum viable slice** that
> fixes the user's 28-Jun incident. S2 and S3 are additive — they
> make the identity persistent in the registry and threaded through
> the rest of the swarm tools. We land S1+S4 first, then S2+S3.

### S1 — Identity contract + slug formatters

- **Status**: pending
- **Files**:
  `packages/core/src/lib/contracts/interfaces/agent-identity.ts` (NEW),
  `plugins/proposals/src/lib/shared/agent-identity.ts` (NEW,
  slug formatters + compose / parse)
- **Gate**: `bun run test`
- **Acceptance**:
  - `IAgentIdentity` interface with four fields, all optional
    except `agent_name`:
    ```ts
    interface IAgentIdentity {
      readonly agent_name: string;     // required: pool member or host pair
      readonly host?: AgentHost;       // 'copilot' | 'claude-code' | 'codex-cli' | …
      readonly model?: string;         // free-form, max 24 chars after slug
      readonly task_id?: string;       // current proposal/task
    }
    ```
  - `slugifyHost('GitHub Copilot Chat')` returns `'copilot'`.
  - `slugifyModel('claude-3-5-sonnet-20240620')` returns
    `'claude-3-5-sonnet'` (truncated to 24 chars after slugify).
  - `composeIdentity({ agent_name: 'orion', host: 'copilot', model: 'm3', task_id: 'f00078' })`
    returns `'copilot-m3-orion-f00078'`. **(R)**
  - `composeIdentity({ agent_name: 'copilot-minimax-m3' })` returns
    `'copilot-minimax-m3'` (no fields dropped — backwards compat).
  - `parseIdentity('copilot-m3-orion-f00078')` returns the four
    fields. The parser is **lossy-friendly**: unknown hosts / models
    pass through as `host: 'unknown'` / `model: 'unknown'` instead
    of erroring.
  - `nextCollisionSuffix(existingBranches, composite)` returns the
    smallest integer `n ≥ 1` such that `composite-${n}` is not in
    `existingBranches`. Pure, deterministic, no filesystem.

### S2 — Extend `IAgentAssignment` with the new fields + migrate registry

- **Status**: pending
- **Files**:
  `plugins/proposals/src/lib/shared/agent-registry-store.ts` (MODIFY)
- **Gate**: `bun run test`
- **Acceptance**:
  - `IAgentAssignment` gains `host?: AgentHost`, `model?: string`,
    `task_id?: string` (all optional for backwards compat).
  - The migrator at `agent-registry-store.ts:runMigrations(...)` adds
    the three fields with default `null` to existing entries on first
    load. **Never** destroys existing data.
  - `agent-registry-store.ts:read()` accepts entries with or without
    the new fields; missing fields default to `null` so older
    entries coexist with newer ones in the same registry.
  - `agent-registry-store.ts:upsert(assignment)` writes the new
    fields when present. The on-disk JSON schema bump is
    `version: 2`.

### S3 — Thread the identity through agent_names, agent_lock, delegate

- **Status**: pending
- **Files**:
  `plugins/proposals/src/lib/tools/agent-names.tool.ts` (MODIFY),
  `plugins/proposals/src/lib/tools/agent-lock.tool.ts` (MODIFY),
  `plugins/proposals/src/lib/tools/orchestration.tool.ts` (MODIFY),
  `plugins/proposals/src/index.ts` (wire new host/model/task_id
  from `ctx`)
- **Gate**: `bun run test`
- **Acceptance**:
  - `agent_names { action: "assign", host: "copilot", model: "m3", task_id: "f00078", ... }`
    is accepted; the registry stores the new fields.
  - `agent_lock { action: "claim", host, model, task_id, ... }`
    echoes the identity in the response payload. Hosts that
    register their own identity at boot pass it once; the tool
    re-echoes it on every call.
  - `delegate { taskId, host, model, task_id, ... }` propagates
    the identity into the assigned agent's entry. The subagent
    inherits the host + model from the delegating orchestrator.
  - When host/model/task_id are missing, the tools fall back
    to the orchestrator's identity (read from
    `agent_names { action: "whoami" }`) or `null` in the registry.

### S4 — Wire the composite into the worktree engine + tool inputSchema

- **Status**: pending
- **Files**:
  `plugins/proposals/src/lib/agents/agent-worktree-engine.ts` (MODIFY),
  `plugins/proposals/src/lib/tools/agent-worktree.tool.ts` (MODIFY
  inputSchema + JSDoc)
- **Gate**: `bun run test`
- **Acceptance**:
  - `agent_worktree { action: "create", agent: "orion", host: "copilot", model: "m3", task_id: "f00078" }`
    creates the worktree + branch `agent/copilot-m3-orion-f00078`.
  - `agent_worktree { action: "create", agent: "copilot-minimax-m3" }`
    (no new fields) keeps the historical behaviour and creates
    `agent/copilot-minimax-m3` — backwards compat is preserved.
  - When the composite branch already exists, the engine queries
    `git branch --list` and calls `nextCollisionSuffix(...)` to
    pick the next numeric suffix. The result for two consecutive
    `create` calls on the same `(host, model, agent_name, task_id)`
    is `…-f00078` then `…-f00078-1` then `…-f00078-2`. **(R)**
  - `list` and `remove` keep their existing semantics; the
    composite branch is recognised by prefix.
  - The tool description reflects the new fields and the
    collision-suffix policy.

## acceptance

After landing S1..S4:

- Every agent in the registry has, when known: `host`, `model`,
  `task_id`. The constellation name `agent_name` stays primary
  for human ergonomics. **(R)**
- Every worktree branch is `agent/<host>-<model>-<agent_name>-<task_id>`
  (or `agent/<agent_name>` for old agents that do not pass the
  new fields). Two agents on the same constellation in the same
  proposal land on different branches. **(R)**
- When the composite branch already exists, the next agent on the
  same `(host, model, agent_name, task_id)` lands on
  `…-task_id-1`, then `…-task_id-2`, … — predictable, numeric,
  not random. **(R)**
- The handoff packet answers "who is the previous agent?" with a
  single line: `copilot/m3/orion/f00078`.
- `proposals_swarm_hygiene { }` can group rescue candidates by
  `(host, model)` for cost / quality analysis.
- `bun run validate` is green; no regression on the solo path
  (agents that do not pass host/model get the legacy branch name).

## risks and mitigations

- **Risk: branch name collisions.** Two agents on the same host,
  same model, same constellation, same task would land on the
  same branch. **Mitigation:** the engine calls
  `nextCollisionSuffix(...)` against `git branch --list` and
  appends a **numeric suffix** (`-1`, `-2`, …) when the
  composite is otherwise duplicate. The suffix is recoverable
  from `git log --all` — it is in the branch name, not in a
  hidden file. **(R)**
- **Risk: backward compat for older hosts.** A host that does
  not know about the new fields continues to claim branches named
  `agent/<agent_name>`. Two such hosts land on the same branch
  and conflict. **Mitigation:** the SKILL section for f00082
  marks the new fields as `required for new hosts, optional for
  existing`. Older hosts that do not pass them get a one-time
  deprecation warning on `agent_worktree create`.
- **Risk: model names change.** The user renames their LLM model
  and the registry has stale entries. **Mitigation:** the
  `IAgentAssignment` carries `assigned_at` and `last_seen`
  timestamps; the user can see the staleness. A `prune` action on
  `agent_names` cleans entries older than `cooldown_days`.
- **Risk: the composite identity is too long.** POSIX ref-name
  limit is 255 chars; we cap at 92 to leave headroom for
  branch-protection prefixes and the `-N` suffix. **Mitigation:**
  the slugifiers cap each field at 24 chars; the total composite
  is bounded. **(R)**

## notes

- The user proposed `{extension}-{modelo}-{propuesta}`. We extend
  the format to the four-field composite (`<host>-<model>-<agent>-<task_id>`)
  because the constellation name (`agent_name`) is semantically
  distinct from the host/model — the constellation is a
  human-friendly handle, the host/model identify the work. The
  `agent_slot` is dropped from the branch name (the 28-Jun review
  showed it bloats the branch without adding value humans can act
  on) but stays in the registry for the swarm tools. **(R)**
- This proposal does **not** change the `agent_name` pool or
  the `agent_slot` roles. Those are stable contracts. The new
  fields are additive.
- The SKILL `multi-agent-coordination/SKILL.md` already
  documents the worktree branch convention
  (`agent/<assigned-name>`). f00082 S4 updates it to
  `agent/<host>-<model>-<agent_name>-<proposal_id>` and adds a
  deprecation note for the old form.
- Cost attribution is a follow-up. The composite identity
  records `model`, which the user can map to their own cost
  data; we do not store or surface price.