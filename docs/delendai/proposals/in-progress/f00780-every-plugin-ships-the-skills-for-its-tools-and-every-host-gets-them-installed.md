---
id: f00780
title: "Every plugin ships the skills for its tools, and every host gets them installed"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-20
related:
  - q00009
  - f00760
last-transition-id: a2ba19b1-0b7c-4dc8-a15e-fe70af4ac8a6
last-correlation-id: a2ba19b1-0b7c-4dc8-a15e-fe70af4ac8a6
last-transition-from: ready
last-transition-at: 2026-10-22T07:30:20.909Z
---

# f00780 — Every plugin ships the skills for its tools, and every host gets them installed

## goal

A plugin carries skills for the way its tools are meant to be used. Each skill names the plugin and tools it belongs to, and each tool's catalogue entry points to its skill by reference: the body is read only when a worker needs it. When a plugin is active in a project, its skills are installed where each of the project's hosts reads skills natively (Claude Code, Codex, Copilot, OpenCode, …). Each skill comes from one source, gets the start-up migration that keeps it current, and is removed when its plugin goes.

## why

The owner, 2026-10-20: "tendríamos que pensar en añadir skills también al proyecto y a los plugins y que se expongan con cada herramienta o plugin y que se autoinstalen".

What exists on `develop` today:

- 8 of 61 plugins ship a `skills/` folder (audit, commit-policy, external-mcps, proposals, quality, rules, skills-pack, status-marker), 20 `SKILL.md` in all. The other 53 plugins, with most of the tools, have none.
- The server assembles a skill catalogue (`packages/core/src/lib/cli/assemble-skills.ts`) and serves skills over MCP. `init` copies the portable core skills into the project's docs folder (`core-skill-projection.service.ts`).
- The host adapter pack declares an `install-skills` action for every host whose profile says it reads skills (`packages/core/src/lib/hosts/host-adapter-pack.ts`). **Nothing performs it.** No host gets a skill in the place it reads skills from.
- No tool says which skill explains it. An agent that sees `work_enter` in `tools/list` has no pointer to the playbook that says when and how to use it.

So the knowledge exists but does not reach agents: they rediscover usage through trial calls and long tool descriptions. That costs tokens on every session, and different hosts are taught differently.

## non-goals

- Copying skill bodies into tool descriptions. The reference keeps `tools/list` within its byte budget (TOKEN-BUDGETS).
- Writing for a host the project does not use. Hosts are the ones declared or detected (f00760).
- A second skill store. The plugin's `skills/` folder is the only source; everything installed is generated from it and marked as such.

## slices

- global_gate: type

### S1 — A skill belongs to a plugin and its tools

- **Status**: pending
- **Files**: `docs/delendai/TOKEN-BUDGETS.md`, `packages/core/src/cli.ts`, `packages/core/src/generated/tool-outputs.ts`, `packages/core/src/lib/catalog/agent-discovery-catalog.ts`, `packages/core/src/lib/catalog/agent-discovery-types.ts`, `packages/core/src/lib/cli/assemble-skills.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/src/lib/skills/skill-catalog.ts`, `packages/core/src/lib/skills/sources/package-skill-source.ts`, `packages/core/src/lib/skills/sources/types.ts`, `packages/core/src/lib/skills/tool-skill-index.ts`, `packages/core/src/lib/tools/tool-surface.tool.ts`, `packages/core/tests/src/lib/skills/tool-skill-index.spec.ts`, `tools/scripts/lint/skills-script.spec.ts`, `tools/scripts/lint/skills-script.ts`
- **Gate**: type
- acceptance:
  - "`SKILL.md` frontmatter may name `plugin` and `tools`. The catalogue reports, for each tool, the skills that name it (`tool-skill-index.ts`). `lint:skills` refuses a skill that names a tool no plugin registers; it is part of validate:run."
  - "A tool's catalogue entry carries `skill: <id>`, a reference of a few bytes. `tool_search` and the route lookup show it; TOKEN-BUDGETS was regenerated and stays within budget."

### S2 — Skills are installed where each host reads them

- **Status**: pending
- **Files**: `packages/cli/src/commands/init/init.command.ts`, `packages/core/src/cli.ts`, `packages/core/src/lib/cli/assemble-skills.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`, `packages/core/src/lib/contracts/constants/plugin-skills.constant.ts`, `packages/core/src/lib/contracts/interfaces/agent-host.interface.ts`, `packages/core/src/lib/contracts/interfaces/agent-role-contribution.interface.ts`, `packages/core/src/lib/contracts/interfaces/agent-signature.interface.ts`, `packages/core/src/lib/hosts/plugin-skills.service.ts`, `packages/core/src/lib/scaffold/agent-signature.helper.ts`, `packages/core/src/lib/scaffold/plugin-skills-report.ts`, `packages/core/src/lib/skills/active-plugin-skills.ts`, `packages/core/tests/src/lib/hosts/plugin-skills.service.spec.ts`, `packages/core/tests/src/lib/scaffold/plugin-skills-report.spec.ts`, `.gitignore`
- **Gate**: type
- acceptance:
  - "The `install-skills` action is performed by `plugin-skills.service.ts` (`syncPluginSkills`). The folder each host reads skills from is declared on the host in `agent-hosts.constant.ts` (not in host-adapter-pack or host-capability-profile). `init` and a start-up sync (`reportPluginSkills`, run by `assemble.ts`) write the active plugins' skills there, each with a marker and the source hash."
  - "A skill whose source changed is rewritten. One whose plugin left, or written for a host the project no longer uses, is deleted. A file without the marker, or edited by hand, is never touched."
  - "Writing respects the project's hosts (declared or detected, `projectAgentHosts`). The installed set is recorded among delendai's records (`INSTALLED_SKILLS_RECORD`); a start-up sync, not a separate migration step, keeps it current."

### S3 — A plugin's activation brings its skills

- **Status**: pending
- **Files**: `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`, `packages/core/src/lib/scaffold/plugin-skills-report.ts`, `packages/core/src/lib/tools/tool-surface.tool.ts`, `packages/core/tests/src/lib/scaffold/plugin-skills-report.spec.ts`
- **Gate**: type
- acceptance:
  - "`delendai_plugin_activate` installs the plugin's skills for the project's hosts and `delendai_plugin_deactivate` removes them, through `syncPluginSkills`: `createPluginSkillSurfaceSync` (plugin-skills-report.ts) keeps the set of plugins switched on, is built in `assemble.ts` for a project with a configuration, and `tool-surface.tool.ts` calls it after a successful change. The tool schemas are unchanged."

### S4 — Coverage where tools are used most

- **Status**: pending
- **Files**: `package.json`, `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`, `plugins/auto-agent-selector/package.json`, `plugins/auto-agent-selector/skills/delendai-auto-agent-selector-playbook/SKILL.md`, `plugins/orchestrator-runner/package.json`, `plugins/orchestrator-runner/skills/delendai-orchestrator-runner-playbook/SKILL.md`, `plugins/proposals/skills/delendai-work-unit-playbook/SKILL.md`, `tools/scripts/lint/skill-coverage.baseline.json`, `tools/scripts/lint/skill-coverage.script.spec.ts`, `tools/scripts/lint/skill-coverage.script.ts`
- **Gate**: type
- acceptance:
  - "`lint:skill-coverage` (`skill-coverage.script.ts`) lists registered tools with no skill and their plugins, ranked by calls recorded in usage-tracking (`--usage=<invocations.jsonl>`, default the project's results folder; none recorded ranks by name). It is chained into `lint:architecture`, and a baseline (`skill-coverage.baseline.json`, 213 tools) may only fall; `--update` lowers it."
  - "Skills were written for the three most-used uncovered owners, each with `plugin` and `tools` frontmatter: `delendai-work-unit-playbook` (the `work` tool, shipped with the proposals plugin that registers it), `delendai-orchestrator-runner-playbook` (12 tools) and `delendai-auto-agent-selector-playbook` (5 tools). The two plugins now list `skills` in their package files. The before and after measurement of the first task was not taken."

## acceptance

- A fresh project with Claude Code and Codex as its hosts gets each active plugin's skills in both hosts' skill locations after `init`. Every tool with a skill points to it. Deactivating a plugin removes its skills.
- The first-task measurement in S4 is recorded for at least three plugins.
