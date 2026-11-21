---
id: x00199
title: "a00084 fix — open-agent-catalog.ts webview message duck-typing"
kind: fix
status: done
type: proposal
track: a00084-audit-followup
date: 2026-07-30
shipped-in:
    - fcfa8310 # fix(x00199): a00084 #31 — open-agent-catalog.ts webview message duck-typing
---

# x00199 — a00084 fix — open-agent-catalog.ts webview message duck-typing

## Goal

Fix a00084 finding #31: the agent-catalog webview's `onDidReceiveMessage` handler duck-typed dispatch (`(message as {command?:unknown}).command === 'refresh'`, etc.) instead of validating the whole message shape up front — the x00188 fix brought zod-discriminated-union validation to the configuration-center webview but missed this one. Added `AGENT_CATALOG_MESSAGE_SCHEMA` (same pattern as `configuration-center-message-schema.constant.ts`) covering all 5 commands (`refresh`, `copied`, `callTool`, `openSkill`, `openProposal`), and switched the handler to `.safeParse` + fail-closed on any malformed/unknown message.

## why

Rule 5 (never trust unvalidated boundary input) + workflow-integrity precedent already set by x00188 for the sibling webview. A malformed message (wrong type, missing id, unexpected extra fields) previously fell through the duck-typed checks silently or could throw deeper in a handler expecting a validated shape; now it fails `safeParse` cleanly with zero dispatch.

## non-goals

- Adding a user-visible error message on a rejected agent-catalog message (unlike configuration-center's `showErrorMessage`) — kept behavior-equivalent to today's silent no-op on an unrecognized message shape; this proposal is about closing the validation gap, not changing the UX contract.

## Slices

- global_gate: type

### S1 — AGENT_CATALOG_MESSAGE_SCHEMA + handler migration
- **Status**: done
- **Files**: `extensions/vscode/src/contracts/constants/agent-catalog-message-schema.constant.ts`, `extensions/vscode/src/contracts/interfaces/agent-catalog-message.interface.ts`, `extensions/vscode/src/commands/open-agent-catalog.ts`, `extensions/vscode/src/test/agent-catalog.spec.ts`
- **Gate**: type
- acceptance:
  - "onDidReceiveMessage validates via AGENT_CATALOG_MESSAGE_SCHEMA.safeParse, no more duck-typed (message as {command?:unknown}).command"
  - "a malformed message (wrong id type, unknown command, extra fields, non-object) never dispatches to any handler"
  - "all 5 commands (refresh, copied, callTool, openSkill, openProposal) still dispatch correctly on a well-formed message"
  - "bun test extensions/vscode passes (226/227, 1 pre-existing unrelated vi.stubGlobal failure)"

## acceptance

- onDidReceiveMessage validates via AGENT_CATALOG_MESSAGE_SCHEMA.safeParse, no more duck-typed (message as {command?:unknown}).command
- a malformed message (wrong id type, unknown command, extra fields, non-object) never dispatches to any handler
- all 5 commands (refresh, copied, callTool, openSkill, openProposal) still dispatch correctly on a well-formed message
- bun test extensions/vscode passes (226/227, 1 pre-existing unrelated vi.stubGlobal failure)
