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
- **A second naming scheme.** `agent/<role>/<id>-<slice>-<topic>` branches
  appeared in the same project from the proposals worktree engine, which
  hardcodes `agent/` regardless of the development policy.
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

### S2 — An integrated work ref is removed, locally and on the remote

- **Status**: pending
- **Files**: []

When a work ref's tip is contained in the integration branch, delendai
deletes it: at each checkpoint for refs in its own work namespace, and at
startup reconciliation. The same containment proof as
`lint:ref-lifecycle`'s `work-published` role applies, so a ref with
unintegrated commits is never touched. The remote copy goes too, through
a non-forced delete, since that is where the observed residue lived.

- **Gate**: a spec over a real repository with a bare remote: an integrated
  work ref is gone from both after a checkpoint, and an unintegrated one
  remains.

### S3 — Agent worktree branches follow the development policy

- **Status**: pending
- **Files**: []

`agent-worktree-engine` builds `agent/${composite}` whatever the policy
says. A profile with a pinned shared checkout does not use agent worktrees
at all, and a profile that does has its own `workRefTemplate`. The engine
either derives its branch from the policy or refuses under a profile that
does not use worktrees, with a remedy naming the profile.

- **Gate**: specs for `shared-checkout-merge` (refused) and `worktree-pr`
  (branch derived from its template).

### S4 — A missing integration branch is reported, not worked around

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
