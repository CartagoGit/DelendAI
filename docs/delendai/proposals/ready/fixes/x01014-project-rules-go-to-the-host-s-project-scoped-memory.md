---
id: x01014
title: "Project rules go to the host's project-scoped memory"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: d99ba717-9d05-41c0-b8b7-2d1b7a72a389
last-correlation-id: d99ba717-9d05-41c0-b8b7-2d1b7a72a389
last-transition-from: review
last-transition-at: 2026-11-04T20:18:09.727Z
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
- **Status**: pending
- **Files**: `docs/delendai/host-appendices/copilot-chat.md`, `docs/delendai/host-appendices/generic-hosts.md`, `packages/cli/src/lib/init/init-hosts.helper.ts`, `packages/cli/src/lib/init/init-hosts.helper.spec.ts`
- **Gate**: none
- acceptance:
  - "The Copilot appendix and the Copilot block init writes say that project facts go to /memories/repo/ and never to the user scope, and the generic appendix says it in one line; every appendix stays within its system-prompt-size budget."
- shipped-in: `6e3d5921baca`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: shipped-in 6e3d5921baca is stale for this slice. `git log 6e3d5921baca..develop -- <S1 files>` shows post-shipped changes (e.g. a190479ea), so acceptance must be re-validated on current develop and re-submitted with fresh evidence.

## acceptance

- The Copilot appendix and the Copilot block init writes say that project facts go to /memories/repo/ and never to the user scope, and the generic appendix says it in one line; every appendix stays within its system-prompt-size budget.
