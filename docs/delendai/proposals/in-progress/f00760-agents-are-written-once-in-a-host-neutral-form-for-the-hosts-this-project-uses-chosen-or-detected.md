---
id: f00760
title: "agents are written once in a host-neutral form, for the hosts this project uses, chosen or detected"
kind: feat
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: 7d1a559c-e710-4f05-bb26-80204b4a0dd6
last-correlation-id: 7d1a559c-e710-4f05-bb26-80204b4a0dd6
last-transition-from: ready
last-transition-at: 2026-10-13T21:27:06.888Z
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

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/agent-host.interface.ts`
  - `packages/core/src/cli.ts`
- **Gate**: type
- acceptance:
  - One declaration per host (`AGENT_HOSTS`) gives where its agent files go and in which format, its instructions file, and the evidence that it is in use (paths in the project, variables in the environment).
  - It covers Copilot, Claude Code, Codex CLI, OpenCode, Cursor, Windsurf, Gemini CLI, Continue and the terminal agents that read `AGENTS.md`. A host whose agent format is not known gets instructions only.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The project chooses its hosts; detection fills in when it does not

- **Status**: review
- **Files**:
  - `packages/core/src/lib/hosts/project-hosts.service.ts`
  - `packages/core/src/lib/hosts/declared-hosts.helper.ts`
  - `packages/core/src/lib/plugins/config-file-schema.ts`
  - `packages/core/src/lib/plugins/load-config-file.ts`
  - `packages/core/schema/delendai.config.schema.json`
  - `packages/cli/src/commands/init/init.command.ts`
  - `packages/cli/src/commands/init/init-default.command.ts`
  - `packages/cli/src/contracts/interfaces/init.interface.ts`
  - `packages/cli/src/lib/init/init-answers.schema.ts`
  - `packages/core/tests/src/lib/hosts/project-hosts.service.spec.ts`
  - `packages/cli/src/commands/init/init-hosts-flag.spec.ts`
- **Gate**: type
- acceptance:
  - `hosts` in `delendai.config.json` (or `DELENDAI_HOSTS` for one run) names the hosts the project uses. Absent, they are the ones its tree and environment show.
  - `init --hosts=<a,b>` writes that choice into the configuration. Without it, init writes agents for the hosts found and for the ones it configures the server for (`.vscode/mcp.json`, `.mcp.json`): Copilot and Claude Code. Codex, OpenCode and the rest only when declared or shown.
  - No agent is written for a host outside the set. Which editors get an MCP entry stays decided by the install targets (`--target`), as before.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Agents are declared once and rendered per host

- **Status**: review
- **Files**:
  - `packages/core/src/lib/hosts/agent-renderers.helper.ts`
  - `packages/core/src/lib/scaffold/plugin-agents.service.ts`
  - `packages/core/src/lib/scaffold/plugin-agents-report.ts`
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/core/src/lib/scaffold/scaffold-host.ts`
  - `packages/core/src/lib/scaffold/scaffold-tool.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/cli/src/lib/init/init-render.service.ts`
  - `packages/core/tests/src/lib/scaffold/plugin-agents.service.spec.ts`
  - `packages/cli/src/lib/init/init-render.service.spec.ts`
- **Gate**: type
- acceptance:
  - delendai's catalog agents and every plugin's `agentRoles` are one host-neutral description (name, description, instructions, entry point, server tool set); each host's renderer turns it into that host's file and front matter (Copilot tool grants and picker visibility, OpenCode `mode`).
  - init, the plugin agent writer and the scaffold write through the registry for the project's hosts; a contributed role reaches every one of them, and the grant reconciler reads the Copilot folder from the registry, the one format that grants by server.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A project with the old layout is migrated at start

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/hosts/project-hosts.service.ts`
  - `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - A project from before `hosts` keeps every host it has agents for: their folders are evidence, so nothing is dropped and nothing has to be rewritten at start.
  - A project that declares `hosts` has the generated agents of the other hosts removed at the next start (plugin agents) or init (catalog agents); a file edited by hand is kept and reported.

### S5 — A push that only keeps a unit's work safe is not judged as a publication

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/contracts/constants/durability-push.constant.ts`
  - `packages/core/src/lib/work-units/unit-push.service.ts`
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
  - `packages/core/src/lib/contracts/interfaces/unit-forge-sync.interface.ts`
  - `packages/core/src/lib/shared/git-write.ts`
  - `lefthook.yml`
  - `packages/core/tests/src/lib/work-units/unit-push.service.spec.ts`
- **Gate**: type
- evidence: on 2026-10-13, the first commit of this unit was pushed by the new `post-commit` hook (x00891) and refused by this repository's pre-push `drift-check` (the configuration schema was stale mid-work): "committed here but origin refused it". The pre-push hook runs every publication check (`gen:all --check`, publication proof, format) on every push, so a wip branch, which is durability, not a publication, stayed on one machine whenever the work was unfinished.
- acceptance:
  - The pushes delendai makes to keep a unit's branch on the forge carry `DELENDAI_DURABILITY_PUSH=1`, and this repository's publication checks skip such a push. Secrets, empty commits, the guard and the integration-branch protections still run on it.
  - A push without the variable, a publication included, runs every check as before.

## acceptance

- A project gets agents only for the hosts it uses, declared or detected.
- Adding a host is one registry entry, and every writer picks it up.
- delendai's and the plugins' agents are written once and rendered per host.
