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
  - { agent: implementation_runner, task: 'S1: define the IAIdentity interface and the slug-safe formatters (host/model/slot/proposal)' }
  - { agent: implementation_runner, task: 'S2: extend IAgentAssignment with host + model + proposal_id and migrate the registry' }
  - { agent: implementation_runner, task: 'S3: pass host + model + proposal_id through agent_names / agent_lock / delegate so the registry fills them in' }
  - { agent: implementation_runner, task: 'S4: surface the identity in the agent_lock payload, the worktree branch name, and the handoff packet' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run test,      expect: exit0 }
  - { command: bun run validate,  expect: exit0 }
---

# f00082 — Composite agent identity

## goal

Today, "an agent" is identified by `agent_name` (a constellation from
the pool: `andromeda`, `orion`, `vela`, ...) plus `agent_slot`
(orchestrator, implementation_runner, ...). That is **anonymous by
design** — the user is told "orion is working on f00078" with no way
to tell which host or model produced the work. After a 12-hour
incident, that anonymity makes forensics and cost attribution
impossible.

This proposal attaches **three additional fields** to every agent
identity: `host` (which IDE/CLI), `model` (which LLM), and the
`proposal_id` the agent is currently working on. The four fields
together form a composite identity that survives log rotation, host
restart, and agent hand-off.

## why

The user complaint that triggered this slice: "como saben que agente
es cada uno?". Today the answer is "they're not" — the registry
keeps the constellation name but discards the context that made the
work attributable in the first place. With three agents from three
different hosts working on three proposals at the same time, the
working tree becomes a soup of `agent/orion` branches with no way to
tell which host model produced which commit.

The four fields also make the swarm tools (f00073/75/78) more
useful: `proposals_swarm_hygiene` can group rescue candidates by
`host+model` (a model with a high rescue rate is a model to debug),
`proposals_branch_gc` can keep the last-N worktrees per host instead
of globally, and `agent_loop_detector` can weight reclaims differently
for different models (an o1 retry is expected, a gpt-4-mini retry is
a loop).

## why this design

- **Three fields, not one.** The user proposed `{extension}-{modelo}-{propuesta}`. We
  extend the format to `{host}-{model}-{agent_name}-{slot}-{proposal_id}` and
  the agent's display identity (what humans read in logs, the
  handoff packet, the commit author line) becomes:
  `copilot-claude-3-5-sonnet-orion-implementation_runner-f00078`. That
  is verbose, but it is also unambiguous: you know exactly who did
  what, with what, and why.
- **The five-field identity is also the worktree branch name** when
  the host has the `agentWorktree` gate on. `agent/orion-f00078`
  becomes `agent/copilot-claude-3-5-sonnet-orion-f00078`. Two agents
  with the same constellation name in the same proposal (one Copilot,
  one Claude Code) end up on different branches and cannot conflict.
- **Backwards compatible.** The current `agent_name` field stays
  primary; `host`, `model`, and `proposal_id` are optional. Old
  agents that do not pass them get a registry entry with the new
  fields empty, and the worktree branch falls back to
  `agent/<agent_name>-<proposal_id>`.
- **Slug-safe formatters.** Hosts and models have spaces, dots,
  colons, slashes. The formatters normalise to `[a-z0-9-]` and cap
  length at 32 chars per field to keep the composite branch name
  under 100 chars total (POSIX ref-name limit is 255; we leave
  headroom).
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
plugins/proposals/src/lib/shared/agent-registry-store.ts     # MODIFY
  IAgentAssignment + IAgentIdentity merge
  upsert() accepts the new fields
plugins/proposals/src/lib/agents/agent-names.tool.ts         # MODIFY
  action: "assign" takes host + model + proposal_id
plugins/proposals/src/lib/tools/agent-lock.tool.ts           # MODIFY
  payload echoes identity (host, model, agent_name, slot, task_id, proposal_id)
plugins/proposals/src/lib/tools/delegation/orchestration.tool.ts # MODIFY
  delegates carry host + model + proposal_id into the assigned agent
plugins/proposals/src/lib/tools/agent-worktree.engine.ts    # MODIFY
  branch name uses the composite slug when agentWorktreeEnabled
plugins/proposals/src/lib/handoff/handoff-packet.ts          # MODIFY
  identity is the first section of the handoff JSON
plugins/proposals/skills/multi-agent-coordination/SKILL.md  # UPDATE
  section "Agent identity (f00082)" — what each host must pass
```

## slices

### S1 — Identity contract + slug formatters + host adapter extension

- **Status**: pending
- **Files**:
  `packages/core/src/lib/contracts/interfaces/agent-identity.ts` (NEW),
  `plugins/proposals/src/lib/shared/agent-identity.ts` (NEW,
  slug formatters + parsers),
  `packages/ui-extension/src/contracts/interfaces/host-adapter.interface.ts`
  (MODIFY — add `getActiveModelId(): string | undefined`),
  `extensions/vscode/src/host/vscode-host-adapter.ts` (MODIFY —
  implement `getActiveModelId` via `vscode.lm`)
- **Gate**: `bun run test`
- **Acceptance**:
  - `IAIdentity` interface with five fields, all optional except
    `agent_name`:
    ```ts
    interface IAIdentity {
      readonly agent_name: string;        // required: pool member
      readonly agent_slot: IAgentCanonicalRole; // required
      readonly host?: AgentHost;          // one of the known hosts
      readonly model?: string;            // free-form slug, max 32 chars
      readonly proposal_id?: string;      // current proposal
    }
    ```
  - `slugifyHost('GitHub Copilot Chat')` returns `'copilot'`.
  - `slugifyModel('claude-3-5-sonnet-20240620')` returns
    `'claude-3-5-sonnet-20240620'` (already slug-safe).
  - `composeIdentity({...})` returns the five-field slug
    `copilot-claude-3-5-sonnet-orion-implementation_runner-f00078`
    truncated to 100 chars.
  - `parseIdentity('copilot-claude-3-5-sonnet-orion-implementation_runner-f00078')`
    returns the same five fields. The parser is **lossy-friendly**:
    unknown hosts / models pass through as `host: 'unknown'` /
    `model: 'unknown'` instead of erroring.
  - `IHostAdapter.getActiveModelId(): string | undefined` returns
    the model id of the active chat. The VS Code implementation
    uses `vscode.lm.selectChatModels({ vendor: ... })` (the API
    VS Code exposes for chat model discovery) to look up the
    active model by the chat id stored in the active tab. When
    no chat is active, returns `undefined`.
  - The host adapter falls back to `undefined` when the API is
    not available (older VS Code, non-VS Code hosts). Identity
    remains valid with `model` empty.

### S2 — Extend `IAgentAssignment` with the new fields + migrate registry

- **Status**: pending
- **Files**:
  `plugins/proposals/src/lib/shared/agent-registry-store.ts` (MODIFY)
- **Gate**: `bun run test`
- **Acceptance**:
  - `IAgentAssignment` gains `host?: AgentHost`, `model?: string`,
    `proposal_id?: string` (all optional for backwards compat).
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
  `plugins/proposals/src/index.ts` (wire new host/model/proposal
  from `ctx`)
- **Gate**: `bun run test`
- **Acceptance**:
  - `agent_names { action: "assign", host: "copilot", model: "claude-3-5-sonnet", proposal_id: "f00078", ... }`
    is accepted; the registry stores the new fields.
  - `agent_lock { action: "claim", host, model, proposal_id, ... }`
    echoes the identity in the response payload. Hosts that
    register their own identity at boot pass it once; the tool
    re-echoes it on every call.
  - `delegate { taskId, host, model, proposal_id, ... }` propagates
    the identity into the assigned agent's entry. The subagent
    inherits the host + model from the delegating orchestrator.
  - When host/model/proposal_id are missing, the tools fall back
    to the orchestrator's identity (read from
    `agent_names { action: "whoami" }`) or `null` in the registry.

### S4 — Surface the identity everywhere humans look

- **Status**: pending
- **Files**:
  `plugins/proposals/src/lib/tools/agent-worktree.engine.ts` (MODIFY),
  `plugins/proposals/src/lib/handoff/handoff-packet.ts` (MODIFY),
  `plugins/proposals/skills/multi-agent-coordination/SKILL.md` (UPDATE)
- **Gate**: `bun run test`
- **Acceptance**:
  - When `agentWorktreeEnabled === true`, the worktree branch name
    is `agent/<host>-<model>-<agent_name>-<proposal_id>` (truncated
    to 100 chars) instead of `agent/<agent_name>`. Old agents that
    do not pass host/model fall back to `agent/<agent_name>-<proposal_id>`.
  - The handoff packet (`<cacheDir>/handoff/<session>-<ts>.json`)
    has a new `identity` section as its FIRST key, with the full
    five-field composite. The current `summary` section stays for
    backwards compat.
  - The SKILL adds a "Agent identity (f00082)" section explaining
    the composite format, the slug rules, and the worktree branch
    mapping. Hosts that want to participate MUST read this
    section.

## acceptance

After landing S1..S4:

- Every agent in the registry has, when known: `host`, `model`,
  `proposal_id`. The constellation name `agent_name` stays primary
  for human ergonomics.
- Every worktree branch is `agent/<host>-<model>-<agent_name>-<proposal_id>`
  (or `agent/<agent_name>-<proposal_id>` for old agents). Two
  agents on the same constellation in the same proposal land on
  different branches.
- The handoff packet answers "who is the previous agent?" with a
  single line: `copilot/claude-3-5-sonnet/orion/implementation_runner/f00078`.
- `proposals_swarm_hygiene { }` can group rescue candidates by
  `(host, model)` for cost / quality analysis.
- `bun run validate` is green; no regression on the solo path
  (agents that do not pass host/model get the legacy branch name).

## risks and mitigations

- **Risk: branch name collisions.** Two agents on the same host,
  same model, same constellation, same proposal would land on the
  same branch. **Mitigation:** the formatters append a short
  random suffix (4 hex chars from the assignment timestamp) when
  the composite is otherwise duplicate. The suffix is in the
  registry, not just in the branch name, so it is recoverable.
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
  limit is 255 chars; we cap at 100 to leave headroom for
  branch-protection tools. **Mitigation:** the slugifiers cap
  each field at 32 chars; the total composite is bounded.

## notes

- The user proposed `{extension}-{modelo}-{propuesta}`. We extend the
  format to the five-field composite because the constellation
  name (`agent_name`) and the role (`agent_slot`) are
  semantically distinct from the host/model — the constellation
  is a human-friendly handle, the role is a contract. Collapsing
  them into the composite loses both. The user can read the
  composite as "who, with what, doing what role, on which
  proposal".
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