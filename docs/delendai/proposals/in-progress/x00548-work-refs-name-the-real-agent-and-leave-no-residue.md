---
id: x00548
title: "Work refs name the real agent and leave no residue"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-17
tags:
    - git
    - workflow
    - agents
    - host-agnostic
---

# x00548 — Work refs name the real agent and leave no residue

## goal

A project that adopts delendai gets readable work branches from any host,
Claude Code, Codex, Copilot or a terminal, with no identity configuration.
Every branch delendai creates for a unit of work disappears once that work
is integrated, so a Git graph shows live work and nothing else.

## why

Observed on 2026-09-17 in a project that runs delendai from this
repository (`shared-checkout-merge`, integration branch configured as
`feat/migracion-completa-resto-pantallas`):

- More than twenty work refs were pushed to `origin` between 14:40 and
  14:46, one per slice, all named `wip/DESKTOP-9CTQRS7/<id>-<slice>-g1-work`.
- **The agent was the machine.** `${agent}` resolves to the declared model,
  then the declared host, then `hostname()`. Only
  `delendai.config.json#commitAuthor` or `--agent-client`/`--agent-model`
  can declare either, and neither that project nor this repository's own
  `.mcp.json`, `.vscode/mcp.json` or `.codex/config.toml` does. Every MCP
  client reports its name at the handshake, but core used that name only to
  choose the tool-surface mode.
- **The topic was `work`.** The persistence port never passed `${topic}`,
  so the template's default named every ref.
- **Nothing removes them.** Under a profile where
  `integration.requiresPullRequest` is false, the checkpoint "stays on its
  work ref", while the agent also commits the same work directly to the
  integration line. No step deletes a work ref whose content is already
  integrated, locally or on the remote.
- **Finished history was replayed.** At 14:40 all ten slices of a
  proposal committed on 09-15 got fresh checkpoints in the same minute,
  with other long-finished proposals. The first poll asks the
  processed-events store whether a `done` slice was ever persisted, and
  that store had just started empty.
- **A nested `Files` list lost its paths.** One slice was recorded with the
  single path ``- `src/app/workstation-screen/...``: the listener's pattern
  let whitespace cross the newline, took the first nested bullet with its
  marker, and dropped the rest.
- **A second naming scheme.** `agent/<role>/<id>-<slice>-<topic>` branches
  and worktrees appeared in the same project although its profile does not
  use worktrees: delendai's own workflow rules told agents to call
  agent_worktree, and its refusal invited them to enable it.
- **The integration branch no longer existed.** It had been merged into
  `develop` and deleted, while the policy still named it.

## non-goals

- **No deletion of unintegrated work.** A work ref whose tip is not
  contained in the integration branch is never removed automatically.
- **No new required configuration.** Everything here must work with the
  configuration that project already has.

## slices

### S1 — A work ref names the agent every host can identify, and what the work is

- **Status**: done — plugin contexts carry `clientIdentity`, a live accessor
  for the name the MCP client reported at the handshake
  (`IDelendaiHostConfig.onClientInitialized` fills it). commit-policy
  resolves the agent when it names the ref, not at register: the declared
  model, the declared host, the handshake client name, and the machine only
  when no MCP client ever connected. The topic comes from the slice's
  `### S1 — Title` heading, and failing that from the proposal's filename
  slug. Accents are folded, so a title in any language still names the ref,
  and a topic that cannot be resolved never fails a checkpoint. A real
  in-memory MCP connection proves the name reaches a plugin for
  `claude-code`, `codex-mcp-client` and `Visual Studio Code`; with the
  handshake hook removed, those cases fail.
- **Files**: [`packages/core/src/lib/contracts/interfaces/client-identity.interface.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/tests/src/lib/cli/client-identity-wiring.spec.ts`, `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/src/lib/services/work-ref-naming.service.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/work-ref-naming.interface.ts`, `plugins/commit-policy/src/lib/services/work-ref-policy.service.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.interface.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/work-ref-tool.interface.ts`, `plugins/commit-policy/tests/src/lib/services/work-ref-naming.service.spec.ts`, `plugins/commit-policy/tests/src/lib/persistence/work-ref-naming.persistence.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/cli/client-identity-wiring.spec.ts && npx vitest run plugins/commit-policy`

### S2 — Finished history is not replayed, and nested `Files` lists are read whole

- **Status**: done — on the first poll a `done` slice counts as persisted
  when the store says so or when `git status` shows no change to any of its
  files: a slice committed before the cache existed has nothing left to
  persist, whoever committed it. When git cannot answer, the store alone
  decides, as before. The `Files` field is read on its own line, in
  inline, bracketed or nested-list form, without list markers or
  backticks. Driven through the real plugin over a real repository with an
  empty store: a slice whose files are committed is not handed on, the same
  slice with an uncommitted change is; with the git check disabled, the
  first case fails.
- **Files**: [`plugins/commit-policy/src/index.ts`, `plugins/commit-policy/src/lib/services/slice-persisted.service.ts`, `plugins/commit-policy/src/lib/triggers/slice-listener.ts`, `plugins/commit-policy/tests/src/slice-replay.plugin.spec.ts`, `plugins/commit-policy/tests/src/lib/services/slice-persisted.service.spec.ts`, `plugins/commit-policy/tests/src/lib/triggers/slice-files-field.spec.ts`]
- **Gate**: `npx vitest run plugins/commit-policy`

### S3 — An integrated work ref is removed, locally and on the remote

- **Status**: done — after every successful checkpoint, commit-policy
  sweeps the policy's work namespace, locally and on the durability remote,
  and removes a ref only on proof that its work is integrated: its tip is an
  ancestor of the integration head, or every path it changed has the same
  content there. The second case is the observed one, where the agent
  committed the same change to the integration branch as a different
  commit. The ref just written is kept; a remote ref whose commit is not
  known locally is left for its owner; local deletes carry the expected old
  value and remote deletes a lease on it, so a ref that moved is kept. A
  failed sweep is reported in the checkpoint's `reaped` field and never
  fails the checkpoint. Proven against a real repository and bare remote
  replaying the observed sequence: the integrated ref disappears from both,
  unintegrated work survives every sweep.
- **Files**: [`plugins/commit-policy/src/lib/services/integrated-work-refs.service.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/integrated-work-refs.interface.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/persistence.interface.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/tests/src/lib/persistence/integrated-work-refs.persistence.spec.ts`, `plugins/commit-policy/tests/src/lib/services/integrated-work-refs.service.spec.ts`]
- **Gate**: `npx vitest run plugins/commit-policy/tests/src/lib/persistence/integrated-work-refs.persistence.spec.ts`

### S4 — Worktree guidance follows the development policy

- **Status**: done — the cause was the guidance, not the engine. The logs of
  the observed project show `agent_worktree` refused three times, with
  "set agentWorktree: true to enable", after the workflow rules had told
  2+ agents they "must call agent_worktree"; the agent then created the
  worktrees and `agent/*` branches by hand. Core now derives one statement
  of isolation from the resolved policy (`describeWorkIsolation`, on
  `@delendai/core/plugin`). Under a shared-checkout profile it names the
  profile and the integration branch, forbids creating worktrees or
  branches, says to claim files with agent_lock, and says where finished
  slices go. The workflow rules, the `agent_worktree` refusal, its summary
  and its description all read it, and the slice-plan isolation blocker no
  longer tells a shared-checkout agent to create a worktree. Driven through
  the real plugin under `shared-checkout-merge`: the rules and the refusal
  say how to work there; with the policy not passed through, both cases fail.
- **Files**: [`packages/core/src/lib/development-policy/work-isolation.ts`, `packages/core/src/lib/contracts/interfaces/work-isolation.interface.ts`, `packages/core/src/plugin/index.ts`, `packages/core/tests/src/lib/development-policy/work-isolation.spec.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/agent-worktree.tool.ts`, `plugins/proposals/src/lib/knowledge/proposal-workflow.ts`, `plugins/proposals/src/lib/tools/get-proposal-workflow.tool.ts`, `plugins/proposals/src/lib/resources/proposal-templates.resource.ts`, `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts`, `plugins/proposals/tests/src/lib/work-isolation-wiring.spec.ts`, `plugins/proposals/tests/src/lib/tools/agent-worktree.tool.spec.ts`, `plugins/proposals/tests/src/lib/knowledge/proposal-workflow.spec.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-slice-plan.spec.ts`]
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/work-isolation-wiring.spec.ts packages/core/tests/src/lib/development-policy/work-isolation.spec.ts`

### S5 — A missing integration branch is reported, not worked around

- **Status**: pending
- **Files**: []

When `branches.integration` does not resolve locally or on the remote, the
startup report and every checkpoint refusal say so once, clearly, and name
the branches that do exist.

- **Gate**: a spec over a repository whose configured integration branch
  was deleted.

## acceptance

- With no identity configured, a work ref created from Claude Code, Codex
  or Copilot is named after that client, and its topic describes the slice.
- An integrated work ref leaves no local or remote residue.
- No delendai component creates a branch outside the policy's namespaces.

## notes

The observed project was only inspected, never modified. It runs delendai
from this repository's working copy, so each slice reaches it once its
MCP server restarts.
