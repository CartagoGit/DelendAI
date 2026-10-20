---
id: f00780
title: "Every plugin ships the skills for its tools, and every host gets them installed"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-10-20
related:
  - q00009
  - f00760
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
- **Files**: `packages/core/src/lib/cli/assemble-skills.ts`, `plugins/skills-pack/src/skills/catalog.ts`
- **Gate**: type
- acceptance:
  - "`SKILL.md` frontmatter may name `plugin` and `tools`. The catalogue reports, for each tool, the skills that name it. A skill that names a tool no plugin registers is refused by a lint that CI runs."
  - "A tool's catalogue entry carries `skill: <id>`, a reference of a few bytes, within the `tools/list` budget. The managed surface and `delendai_tool_search` show it."

### S2 — Skills are installed where each host reads them

- **Status**: pending
- **Files**: `packages/core/src/lib/hosts/host-adapter-pack.ts`, `packages/core/src/lib/hosts/host-capability-profile.ts`, `packages/cli/src/lib/init/core-skill-projection.service.ts`
- **Gate**: type
- acceptance:
  - "The `install-skills` action is performed. Each host profile names where it reads project skills, and `init` plus a start-up migration write the active plugins' skills there, generated from the plugin's folder with a marker and the source hash."
  - "A skill whose source changed is rewritten. One whose plugin was deactivated or removed is deleted. A file without the marker is never touched (the person's own skill)."
  - "Writing respects the project's hosts (declared or detected) and is journalled like every layout change."

### S3 — A plugin's activation brings its skills

- **Status**: pending
- **Files**: `packages/core/src/lib/tools/tool-surface.tool.ts`
- **Gate**: type
- acceptance:
  - "`delendai_plugin_activate` installs the plugin's skills for the project's hosts, and `delendai_plugin_deactivate` removes them, through the same projection as S2."

### S4 — Coverage where tools are used most

- **Status**: pending
- **Files**: `tools/scripts/lint/skill-coverage.script.ts`
- **Gate**: type
- acceptance:
  - "A report lists active plugins and registered tools with no skill, ranked by recorded use (usage-tracking). It is a ratchet, so the count may only fall."
  - "Skills are written for the most-used uncovered plugins, starting with work, orchestrator-runner and auto-agent-selector. Each is measured: the calls and bytes an agent spends on its first task with that plugin, before and after."

## acceptance

- A fresh project with Claude Code and Codex as its hosts gets each active plugin's skills in both hosts' skill locations after `init`. Every tool with a skill points to it. Deactivating a plugin removes its skills.
- The first-task measurement in S4 is recorded for at least three plugins.
