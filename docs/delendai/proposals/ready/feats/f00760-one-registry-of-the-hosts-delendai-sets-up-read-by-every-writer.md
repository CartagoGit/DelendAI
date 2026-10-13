---
id: f00760
title: "agents are written once in a host-neutral form, for the hosts this project uses, chosen or detected"
kind: feat
status: ready
type: proposal
track: general
date: 2026-10-13
---

# f00760 — agents are written once in a host-neutral form, for the hosts this project uses, chosen or detected

## goal

delendai's agents are declared once, in a form no host owns, and rendered for exactly the hosts this project uses: the ones its configuration names, or, when it names none, the ones detected in it. Init writes no structure for a host nobody uses. A new host (Cursor, Windsurf, OpenCode, Gemini CLI, Continue, a terminal agent, or one that does not exist yet) is one registry entry that every writer picks up.

## why

Extracted from f00542 S6 (which stays paused), and shaped by the owner on 2026-10-13: "init should detect which host we are using, or add the structure for one, or let us configure which ones we want, so the project is not filled with every case — Cursor, Windsurf, OpenCode, terminal, whatever — not only Codex, Claude and Copilot; the agents themselves should be agnostic for any project."

What the code does today:

1. **Agents are written for three hosts, always.** `packages/cli/src/commands/init/init.command.ts` manages `.github/agents`, `.claude/agents` and `.codex/agents` in every project, used or not. A project that only uses Cursor gets three folders it never reads, and no agents in the form Cursor reads.
2. **Five lists of hosts, disagreeing.** `install/ide-targets.ts` (MCP configuration for VS Code, Cursor, Windsurf, Claude Code, Claude Desktop, Antigravity and Zed, with detection and `--target`), `bootstrap/agent-config-rules.ts` (instruction files), `surface/host-mode-profiles.constant.ts`, the init catalog, and `scaffold/plugin-agents.service.ts`. A plugin's agent role (`agentRoles`) is written for Copilot and Claude only, never for Codex. The grant reconciler knows only `.github/agents`.
3. **No way to choose.** The configuration has no setting naming the hosts a project uses. The MCP install detects them, but the agent writers do not ask the detection.
4. **Agents are host-shaped at the source.** Each writer renders its own front matter (`tools: [...]`, `user-invocable`) inline, so a host's format is spread through the code that writes it.

## non-goals

- Generating editor extensions, JetBrains plugins or Neovim bindings (f00542 S6 as written).
- Shipping a renderer for a host before its agent format is documented. The registry marks it as instructions-only until then.

## slices

- global_gate: type

### S1 — One host registry, many hosts

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/hosts/host-registry.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/host-registry.interface.ts`
- **Gate**: type
- acceptance:
  - One declaration per host says what delendai writes for it and how it is recognised: the MCP configuration (scope, path, top-level key, `type: stdio`), the agent folder, file name and renderer, the instructions file, and the evidence of use (files, folders, environment such as the terminal agent's own variables).
  - It covers at least the hosts any of the five lists names today, plus OpenCode, Gemini CLI, Continue and the terminal agents that read `AGENTS.md`. A host whose agent format is not known writes instructions only.
  - A spec fails if any writer still names a host the registry lacks.

### S2 — The project chooses its hosts; detection fills in when it does not

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/plugins/config-file-schema.ts`
  - `packages/core/src/lib/hosts/project-hosts.service.ts`
  - `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - `hosts` in `delendai.config.json` names the hosts the project uses (`["cursor", "opencode"]`). When it is absent, the hosts are the ones detected in the project and on the machine. When nothing is detected, init asks (or, unattended, writes the host-neutral `AGENTS.md` only).
  - `init --hosts=<a,b>` writes that choice into the configuration, and init reports which hosts it chose and why (declared, detected, or asked).
  - Nothing is written for a host outside the set: no empty agent folder, no instructions file, no MCP entry.

### S3 — Agents are declared once and rendered per host

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/hosts/agent-renderers.ts`
  - `packages/core/src/lib/scaffold/plugin-agents.service.ts`
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - delendai's own agents and every plugin's `agentRoles` are one host-neutral description (name, description, instructions, the tools it needs as capabilities). Each host's renderer turns it into that host's file, front matter and tool grants.
  - The plugin agent writer, the grant reconciler and init write only through the renderers, for the project's hosts. A contributed role reaches every one of them.

### S4 — A project with the old layout is migrated at start

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/workspace-migration/migrators/project-hosts.migrator.ts`
- **Gate**: type
- acceptance:
  - A project that has agents for hosts it does not use (the three folders init wrote unconditionally) has `hosts` recorded from what it actually uses. The generated agents of unused hosts are removed; an agent file edited by hand is kept and reported, as `syncPluginAgents` does today.
  - A project with no `hosts` and agents for several hosts keeps them all: the migration infers, it never drops a host somebody may be using.

## acceptance

- A project gets agents only for the hosts it uses, declared or detected.
- Adding a host is one registry entry, and every writer picks it up.
- delendai's and the plugins' agents are written once and rendered per host.
