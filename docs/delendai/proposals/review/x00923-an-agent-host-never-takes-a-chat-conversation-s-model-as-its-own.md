---
id: x00923
title: "An agent host never takes a chat conversation's model as its own"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-20
related:
  - f00770
  - f00772
last-transition-id: 2e969104-7240-4482-b6ef-fd31c9056a32
last-correlation-id: 2e969104-7240-4482-b6ef-fd31c9056a32
last-transition-from: in-progress
last-transition-at: 2026-10-20T02:56:08.202Z
---

# x00923 — An agent host never takes a chat conversation's model as its own

## goal

A process run by an agent host, such as Claude Code, Codex, Gemini CLI, opencode or Cursor, is never named after the model the provider bridge, or the editor's chat record, observed for a chat conversation. No agent is told where the bridge lives, so none copies it into its own declaration.

## why

The owner reported on 2026-10-20 that a Luna review had come out as Sol's. The Codex session record proves it.

Session `01a15129-468c-7d70-8015-ff8261e25343`, started 2026-10-18 22:37 in this workspace, ran on `gpt-6-luna`:

1. At its 28th event it read `~/.cache/delendai/provider-model.json`. That file then held `gpt-6.1-sol`, written by the chat provider serving the owner's Sol conversation in VS Code, in the same workspace at the same time.
2. At event 55 it ran `export DELENDAI_AGENT_ID=gpt-6.1-sol`.
3. It then worked in `gpt-6.1-sol` units of a00095 until the owner stopped it.

The result: Sol's record holds Luna's work, and there is still no independent Luna review (a00095, f00772 I4).

Two mechanisms allowed it:

- **The instruction pointed at the file.** The identity instruction served to every agent (`AGENT_IDENTITY_INSTRUCTION`) gave the bridge's path. An agent unsure of its id opened the file and declared what it found. A declaration comes first in the resolver, so nothing contrasted it afterwards.
- **The bridge answered any process in the workspace.** It is keyed by workspace and guarded by freshness. Two conversations in one workspace at once pass both guards, so a CLI process was handed a chat's model. The editor's own chat record (`hostChatModel`) has the same reach.

## non-goals

- Detecting every borrowed declaration. A declared id is the agent's statement. Contrasting it with what the host can show belongs to f00770.
- Re-attributing a00095's commits. History stays as recorded; the incident is documented in a00095 and f00772.

## slices

- global_gate: type

### S1 — The bridge does not answer an agent host, and no agent is sent to read it

- **Status**: review
- **Files**: `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`, `packages/core/src/lib/contracts/interfaces/provider-model-reading.interface.ts`, `packages/core/src/lib/work-identity/agent-environment.helper.ts`, `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`, `packages/core/tests/src/lib/work-identity/agent-environment.helper.spec.ts`, `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`, `docs/delendai/configuration/provider-model-bridge.md`
- **Gate**: type
- acceptance:
  - "`providerModelReading` returns `reason: 'agent-host'` with the marker found when the process carries an agent host's variable (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `GEMINI_CLI`, `OPENCODE`, a `CODEX_`/`CURSOR_` variable). This holds for a fresh bridge entry and for the editor's chat record."
  - "`AI_AGENT` alone and a known client's profile variable (`CODEX_HOME`) do not count, so a person's shell keeps the bridge."
  - "The served identity instruction no longer names the bridge's path. It says delendai reads the bridge itself, and that an agent never reads it or copies it into `DELENDAI_AGENT_ID`."
- shipped-in: `d56eec666cac`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The specs in S1 pass.
- A Codex process next to a fresh bridge entry naming `gpt-6.1-sol` resolves no identity from it, and `work enter` explains why.
