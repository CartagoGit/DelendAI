---
id: q00037
title: "Plan: the editor extension is the visual face of the CLI for any project"
kind: plan
status: ready
type: proposal
track: extension
date: 2026-11-02
---

# q00037 — Plan: the editor extension is the visual face of the CLI for any project

## goal

Anyone using delendai sees and drives everything from the editor: every command, every plugin including external ones, every proposal, what things cost, and it notices what is new.

## why

The owner's brief of 2026-11-02: the extension is the visual face of the CLI, for any project that uses delendai. It runs any CLI command, shows the state of each plugin, each proposal and what is about to happen, and it works from each project's own state, which lives in SQLite, so it also shows plugins the project added from outside this repository. Each plugin gets its explanation, sections, actions and logs. Proposals, KPIs, spending, tokens, models and hosts are all there. As delendai evolves the extension must notice: anything new appears on its own, or the extension says that it still needs a part for it.

Today it is four panels over a model from before units, queues and managed surfaces. Its fixed lists are second sources of truth, which is how it drifted to calling a router that no longer existed, and fake clients kept every spec green. f00800 makes it work and is the first step here; this plan makes it what it should be.

## non-goals

- The priority of this cycle: findings, stalled proposals, pull-request speed and token use come first.
- Writing state outside the commands the CLI already offers: an action here is a CLI command.
- Lists kept by hand of plugins, tools or commands.

## slices

- global_gate: type

### S1 — The extension runs what the CLI runs
- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/group-helpers.ts`
- **Gate**: type
- acceptance:
  - "Every CLI command appears in the extension from the CLI's own registry, with its flags as a form and its output rendered, and a new command appears with no change to the extension."

### S2 — One dashboard, by section, that remembers
- **Status**: pending
- **Files**: `extensions/vscode/package.json`
- **Gate**: type
- acceptance:
  - "One Dashboard with every section; language, theme and last section survive reloads in one store."

### S3 — Each project reads its own state
- **Status**: pending
- **Files**: `extensions/vscode/src/lib/proposals-snapshot.ts`
- **Gate**: type
- acceptance:
  - "Any project shows its own proposals, units and plugins from its own state, whichever delendai branch it runs."

### S4 — Every plugin has a page, external ones too
- **Status**: pending
- **Files**: `extensions/vscode/src/providers/dashboard-webview-view-provider.ts`
- **Gate**: type
- acceptance:
  - "A page per active plugin, generated from its manifest: explanation, status, tools, skills, actions, logs, configuration; a plugin from outside this repository gets the same page."

### S5 — Work is visible as it happens
- **Status**: pending
- **Files**: `extensions/vscode/src/lib/proposals-snapshot.ts`
- **Gate**: type
- acceptance:
  - "Proposals by state with their slices, what runs, what is blocked and why, the queue, publications and their checks, updated by events."

### S6 — Cost is visible
- **Status**: pending
- **Files**: `extensions/vscode/src/providers/kpi-dashboard-provider.ts`
- **Gate**: type
- acceptance:
  - "KPIs, spending, tokens per task, models and hosts used, from measured figures that state their baseline."

### S7 — The extension notices what it does not know
- **Status**: pending
- **Files**: `extensions/vscode/src/test/tool-names.spec.ts`
- **Gate**: type
- acceptance:
  - "A plugin, tool or command it has no part for still appears through a generic page and says a part is missing, and a gate reports that gap when the plugin is added."

### S8 — It is proved against a real server
- **Status**: pending
- **Files**: `extensions/vscode/src/test/build-smoke.spec.ts`
- **Gate**: type
- acceptance:
  - "The built extension runs against a real server in a throwaway project in CI, and each section is checked for real data."

## acceptance

- Every CLI command appears in the extension from the CLI's own registry, with its flags as a form and its output rendered, and a new command appears with no change to the extension.
- One Dashboard with every section; language, theme and last section survive reloads in one store.
- Any project shows its own proposals, units and plugins from its own state, whichever delendai branch it runs.
- A page per active plugin, generated from its manifest: explanation, status, tools, skills, actions, logs, configuration; a plugin from outside this repository gets the same page.
- Proposals by state with their slices, what runs, what is blocked and why, the queue, publications and their checks, updated by events.
- KPIs, spending, tokens per task, models and hosts used, from measured figures that state their baseline.
- A plugin, tool or command it has no part for still appears through a generic page and says a part is missing, and a gate reports that gap when the plugin is added.
- The built extension runs against a real server in a throwaway project in CI, and each section is checked for real data.
