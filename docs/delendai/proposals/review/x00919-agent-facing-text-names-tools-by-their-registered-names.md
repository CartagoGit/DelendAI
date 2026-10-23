---
id: x00919
title: "Agent-facing text names tools by their registered names"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-18
last-transition-id: 4a6e67ac-f677-47f0-9bce-cc25078cfaa5
last-correlation-id: 4a6e67ac-f677-47f0-9bce-cc25078cfaa5
last-transition-from: in-progress
last-transition-at: 2026-10-18T17:12:45.952Z
---

# x00919 — Agent-facing text names tools by their registered names

## goal

Every tool a plugin's response or plan tells an agent to call is spelled as the server registers it, derived from one rule in core (`${corePrefix}_${pluginPrefix}_${toolId}`, `packages/core/src/lib/cli/assemble.ts`) instead of each plugin guessing it.

## why

A plugin knows its own namespace (`ctx.namespacePrefix`, `delendai_proposals` here) but not the core prefix or a peer plugin's configured prefix, so text naming a peer tool is written by hand. On this repository `auto_work`'s plan says "run logs_query", "notification_await_lock" and "notification_notify_status", which no server registers (they are `delendai_logs_query`, `delendai_notification_await_lock`, `delendai_notification_notify_status`), and the lock engine's needs-worktree refusal tells the agent to call `proposals_agent_worktree`, missing the core prefix. An agent that copies the name gets "tool not found", or has to guess; a project that renames a plugin's prefix makes every guess wrong.

## non-goals

- Renaming any tool.
- Rewording these lines beyond the names they carry.

## slices

- global_gate: type

### S1 — Core names a peer's tool

- **Status**: review
- **Files**: `packages/core/src/lib/plugins/plugin-tool-name.helper.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/plugins/managed-lazy-runtime.ts`, `packages/core/tests/src/lib/plugins/plugin-tool-name.helper.spec.ts`, `packages/core/tests/src/lib/cli/assemble.tool-name-of.spec.ts`
- **Gate**: type
- acceptance:
  - "The plugin context offers `toolNameOf(plugin, toolId)`, returning the name the server registers that plugin's tool under (its configured prefix, under the core prefix), built by the same expression `assemble` uses for `namespacePrefix`. A spec holds a default and a configured prefix."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `da903cb32550`

### S2 — The proposals plugin uses it

- **Status**: review
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/lib/locks/engine.ts`, `plugins/proposals/src/lib/locks/lock-paths.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`
- **Gate**: type
- acceptance:
  - "`auto_work`'s steps name the logs and notification tools, and the lock engine's needs-worktree refusals name the worktree tool, by their registered names. Specs hold each."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `da903cb32550`

## acceptance

- No agent-facing line in the proposals plugin names a tool the server does not register.
