---
id: x00897
title: "external-mcps opens an MCP session before calling a tool"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-14
last-transition-id: a932a8f5-36b7-4b19-a5f2-764c1e6bbc8d
last-correlation-id: a932a8f5-36b7-4b19-a5f2-764c1e6bbc8d
last-transition-from: review
last-transition-at: 2026-10-14T10:36:39.862Z
shipped-in:
  - "ee2214e5a664ea58e8e743830af63211a95dad1a"
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

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ee2214e5a664, validate exit 0, tests 39/39 — Delivery attribution: the slice content landed as c1b3d6c9e plus follow-up de71016a8 inside PR #1079 and reached develop through the merge ee2214e5a, whose first-parent diff touches exactly the five declared files (git show --name-only -m --first-parent), so that is the commit the guard demands and the one approved here. Both branches were read at the merge; the delivered tree for these files is identical to the PR head. Gate type: bun run typecheck exit 0 in the pack worktree. Tests: bun x vitest run --root plugins/external-mcps tests/src/lib/server-registry.spec.ts -> 1 file / 39 tests, exit 0. Non-goals honoured: no tools/list, no capability negotiation beyond the handshake, and a session that failed to open is not restarted - state.session holds {failed} and every later call fails with that same reason. Scope is the registry only; no out-of-scope file changed.

## acceptance

- external-mcps routes a call to a conforming MCP server.
