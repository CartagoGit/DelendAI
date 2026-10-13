---
id: f00760
title: "one registry of the hosts delendai sets up, read by every writer"
kind: feat
status: ready
type: proposal
track: general
date: 2026-10-13
---

# f00760 — one registry of the hosts delendai sets up, read by every writer

## goal

Every editor and agent host delendai configures (its MCP configuration file and key, its agent folder and file format, its instructions file, how it is detected) is declared once, and init, the plugin agent writer, the grant reconciler and the host-mode detection all read that declaration, so a host is supported everywhere or nowhere.

## why

Extracted from f00542 S6 (which stays paused). Generating whole editor extensions is not what delendai needs. What it needs is to configure the hosts it already supports the same way everywhere. Today each writer keeps its own list:

1. **Five lists of hosts.** `install/ide-targets.ts` (MCP configuration per editor: VS Code, Cursor, Windsurf, Claude Code, Claude Desktop, Antigravity, Zed), `bootstrap/agent-config-rules.ts` (instruction files: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, Copilot, Windsurf), `surface/host-mode-profiles.constant.ts`, the CLI's init catalog (`packages/cli/src/commands/init/init.command.ts` writes `.github/agents`, `.claude/agents` and `.codex/agents`), and `scaffold/plugin-agents.service.ts`.
2. **They disagree.** `init` writes each agent for Copilot, Claude and Codex. A plugin's contributed agent role (`agentRoles`, x00885) is written only for Copilot and Claude, so a Codex user never sees it. The grant reconciler (`agent-grant-reconcile.service.ts`) only knows `.github/agents`.
3. **A new host is a hunt.** Supporting one more editor means finding every list, and nothing fails when one is missed.

## non-goals

- Generating editor extensions, JetBrains plugins or Neovim bindings (f00542 S6 as written).
- Supporting hosts beyond the ones delendai already writes for.

## slices

- global_gate: type

### S1 — The host registry

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/hosts/host-registry.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/host-registry.interface.ts`
- **Gate**: type
- acceptance:
  - One declaration per host gives what delendai writes for it: the MCP configuration (scope, path, top-level key, whether `type: stdio` is required), the agent folder with its file name and front-matter format, the instructions file, and the evidence that the host is in use.
  - Every host any of the five lists names today is in it, and a spec fails if a list still names one the registry lacks.

### S2 — Every writer reads it

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/install/ide-targets.ts`
  - `packages/core/src/lib/bootstrap/agent-config-rules.ts`
  - `packages/core/src/lib/scaffold/plugin-agents.service.ts`
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - The install targets, the instruction-file detection, the plugin agent writer, the grant reconciler and `init` take their hosts from the registry; none keeps a list of its own.
  - A plugin's agent role is written for every host `init` writes agents for, Codex included, and the grants are reconciled in each.

### S3 — A layout change for an existing host ships its migration

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/workspace-migration/migrators/host-agents-layout.migrator.ts`
- **Gate**: type
- acceptance:
  - A project whose agents were written only for some hosts gets the missing ones at the next start. An agent file edited by hand is left as it is, as `syncPluginAgents` does today.

## acceptance

- Adding a host is one registry entry, and every writer picks it up.
- A contributed agent reaches every agent host delendai supports.
