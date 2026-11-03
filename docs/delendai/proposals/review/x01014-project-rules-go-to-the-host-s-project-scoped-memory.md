---
id: x01014
title: "Project rules go to the host's project-scoped memory"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: a2d73716-1c27-4167-9f12-0ba9a6b841e0
last-correlation-id: a2d73716-1c27-4167-9f12-0ba9a6b841e0
last-transition-from: in-progress
last-transition-at: 2026-11-03T15:00:38.093Z
---

# x01014 — Project rules go to the host's project-scoped memory

## goal

Every project that uses delendai teaches its agents that a fact, rule or feedback about the project goes to the host's project-scoped memory (Copilot: /memories/repo/), never to the memory every project shares (Copilot: the user scope).

## why

GitHub Copilot's memory tool has a user scope, shared by every workspace (~/.vscode-server/data/User/globalStorage/github.copilot-chat/memory-tool/memories/), and a repository scope kept per workspace under workspaceStorage. Agents in one delendai project saved that project's rules (folder layout, naming) in the user scope. Agents in other projects then read those rules and applied them there, so one project's conventions silently governed unrelated ones. Nothing in the Copilot appendix, in the block init writes for Copilot, or in the generic-host appendix said which scope holds what, so every consumer was left to guess. The rule has to reach every consumer through the three places they receive agent text: the Copilot host appendix, the host text init writes for Copilot, and a one-line generic form for other hosts.

## non-goals

- Moving, deleting or rewriting memories agents have already saved in a user scope; those are the person's files.
- Reading or writing Copilot's memory folders from delendai code; the rule is text agents follow, not a mechanism.
- Adding a memory rule for Claude Code or Codex CLI, whose memories are already per project; only the generic one-line form covers them.
- Raising an appendix size budget in system-prompt-size; the text fits the existing ones.

## slices

- global_gate: none

### S1 — Teach the scope rule where consumers receive it
- **Status**: review
- **Files**: `docs/delendai/host-appendices/copilot-chat.md`, `docs/delendai/host-appendices/generic-hosts.md`, `packages/cli/src/lib/init/init-hosts.helper.ts`, `packages/cli/src/lib/init/init-hosts.helper.spec.ts`
- **Gate**: none
- acceptance:
  - "The Copilot appendix and the Copilot block init writes say that project facts go to /memories/repo/ and never to the user scope, and the generic appendix says it in one line; every appendix stays within its system-prompt-size budget."
- shipped-in: `6e3d5921baca`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- The Copilot appendix and the Copilot block init writes say that project facts go to /memories/repo/ and never to the user scope, and the generic appendix says it in one line; every appendix stays within its system-prompt-size budget.
