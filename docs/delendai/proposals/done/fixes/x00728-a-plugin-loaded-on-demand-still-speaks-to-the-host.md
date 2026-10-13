---
id: x00728
title: "A plugin loaded on demand still speaks to the host"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P1
related: []
last-transition-id: 220b54ea-e063-46d8-b988-2b14a4ab89ad
last-correlation-id: 220b54ea-e063-46d8-b988-2b14a4ab89ad
last-transition-from: review
shipped-in:
  - "4aa599ee9"
---

# x00728 — A plugin loaded on demand still speaks to the host

## goal

A plugin activated by the managed lazy runtime can send the host a log
notification through the server it was registered with, like a plugin
registered directly.

## why

On 2026-09-28 every tool call in the reviewers' servers logged
`onToolCall error: notificationServer.sendLoggingMessage is not a function`.
The lazy runtimes register a plugin's tools against a stand-in whose only
member is `registerTool`. usage-tracking keeps that server to send its
session-hygiene advisory, so the advisory threw on every call and never
reached an agent. completion and external-mcps had each written their own
guard around the same gap.

## why this design

- **One stand-in, `captureServer`**: `registerTool` records the tool, and
  every other member is the project's live server's, bound to it and read
  when used. Before a server exists, a log message is dropped instead of
  thrown.
- **The server is known late**: plugins are assembled before
  `createMcpProject` builds the server, so assembly creates an
  `IHostServerSlot` the project fills, and the managed lazy runtime reads
  it.
- Both lazy paths (the managed runtime and the plugin router) use it.

## non-goals

- Removing the plugins' own guards; they stay correct.

## architecture

- `packages/core/src/lib/plugins/capture-server.ts` (new),
  `packages/core/src/lib/contracts/interfaces/host-server-slot.interface.ts` (new).
- `packages/core/src/lib/plugins/managed-lazy-runtime.ts`, `plugins/router.ts`,
  `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/cli/assemble.ts`,
  `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`,
  `packages/core/src/lib/project/create-mcp-project.ts`.

## Slices

- global_gate: none

### S1 — The captured server reaches the live one

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/plugins/capture-server.spec.ts`
- **Files**:
  - `packages/core/src/lib/plugins/capture-server.ts`
  - `packages/core/src/lib/contracts/interfaces/host-server-slot.interface.ts`
  - `packages/core/src/lib/plugins/managed-lazy-runtime.ts`
  - `packages/core/src/lib/plugins/router.ts`
  - `packages/core/src/lib/cli/assemble-plugins.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`
  - `packages/core/src/lib/project/create-mcp-project.ts`
  - `packages/core/tests/src/lib/plugins/capture-server.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 4aa599ee9 (x00728 S1, merge PR #595). fix(core): a plugin loaded on demand still speaks to the host. Un plugin lazy-loaded sigue pudiendo comunicar errores al host (no se queda mudo cuando no estaba cargado al boot). 380/380 verde en packages/core/tests/src/lib/plugins + cli managed-lazy (36 specs). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #595 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00728-S1-g1/a-plugin-loaded-on-demand-still-speaks-to-the-host (refs/heads/delendai/wip/claude-opus-5-5/implement/x00728-S1-g1/a-plugin-loaded-on-demand-still-speaks-to-the-host) (4aa599ee98e602d311311b9e840338b2e1e91405), opened by minimax-m3

## dependency graph

None.

## acceptance

- A plugin activated lazily that kept its server sends a log message the
  live server receives.
- Before the server exists, the same call resolves and sends nothing.
