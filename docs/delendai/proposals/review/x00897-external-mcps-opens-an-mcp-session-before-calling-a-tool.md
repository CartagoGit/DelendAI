---
id: x00897
title: "external-mcps opens an MCP session before calling a tool"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: bef6a240-e09b-4a64-a06d-ca5d56fe2649
last-correlation-id: bef6a240-e09b-4a64-a06d-ca5d56fe2649
last-transition-from: in-progress
last-transition-at: 2026-10-14T04:06:18.974Z
---

# x00897 — external-mcps opens an MCP session before calling a tool

## goal

The external-mcps subprocess registry opens the MCP session a server expects (`initialize`, its answer, `notifications/initialized`) before it routes any `tools/call`, so it works against conforming MCP servers and not only against the stubs its specs use.

## why

While writing the worked plugin of f00761 S3 (a small Python MCP server), the registry turned out to send `tools/call` as the first message to a server it had just spawned. The MCP lifecycle requires `initialize` first, and the official SDKs refuse any request before it. The registry's specs used a fake child that answered whatever it was sent, so they never noticed. This is one concrete form of "plugins that are there but do not work" from the 2026-10-13 outside review: external-mcps could front only servers that ignore the protocol.

## non-goals

- Listing a server's tools (`tools/list`) or negotiating capabilities beyond the handshake: the registry still routes calls by name.
- Restarting a server whose session failed to open: the call fails with the reason, as a failed spawn does.

## slices

- global_gate: type

### S1 — The registry opens the session first, inside the call's deadline

- **Status**: review
- **Files**:
  - `plugins/external-mcps/src/lib/subprocess/mcp-handshake.helper.ts`
  - `plugins/external-mcps/src/lib/contracts/constants/mcp-handshake.constant.ts`
  - `plugins/external-mcps/src/lib/contracts/interfaces/mcp-handshake.interface.ts`
  - `plugins/external-mcps/src/lib/subprocess/server-registry.ts`
  - `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`
- **Gate**: type
- acceptance:
  - A spawned server receives `initialize` (protocol `2025-06-18`, empty client capabilities, client `delendai` at the core version) and, once it answers, `notifications/initialized`, before any `tools/call`.
  - A call made while the session is opening waits for it within the same call deadline; a server that never answers times the call out; a server that refuses `initialize` fails the call with its reason and receives no `tools/call`.
- shipped-in: `de71016a85a6`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- external-mcps routes a call to a conforming MCP server.
