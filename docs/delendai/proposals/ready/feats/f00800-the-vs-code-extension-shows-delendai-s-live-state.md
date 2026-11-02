---
id: f00800
title: "the VS Code extension shows delendai's live state"
kind: feat
status: ready
type: proposal
track: extension
date: 2026-11-01
---

# f00800 — the VS Code extension shows delendai's live state

## goal

An owner sees in the editor what is running, blocked and landing, from the real server, without asking an agent.

## why

The owner wants the extension to watch delendai's work live, and today it shows nothing. It failed to load from at least 2026-10-29 until the bundle was fixed, and with that fixed, on 2026-11-02, the Dashboard view is an open menu over empty content, Tools and Memory say `MCP server is connecting` for good, and Proposals says `proposal_board returned no payload`.

The views ask once while the client is still connecting and nothing asks again when it connects. Specs drive a fake client, so none of this reached a test. What the panels show was also designed before units, publications, the queue and managed surfaces, so it does not answer what an owner asks: what is running, what is blocked and why, what is about to land.

## non-goals

- Editing state from the extension: it stays a read-only view, plus the commands it has.
- A second source of truth: every panel reads the server, and the web dashboard shares the same model.

## slices

- global_gate: type

### S1 — Views fill when the client connects
- **Status**: pending
- **Files**: `extensions/vscode/src/extension.ts`, `extensions/vscode/src/host/keep-connected.helper.ts`, `extensions/vscode/src/test/extension-runtime-paths.spec.ts`, `extensions/vscode/src/test/keep-connected.spec.ts`
- **Gate**: type
- acceptance:
  - "Every view refreshes when the client connects or reconnects, and a view never stays on a connecting message once the server answers."
  - "Every call reaches the server through the shared client, with no router of the extension's own."
  - "A connection that fails says why and is tried again."

### S2 — The proposals board reads the real payload
- **Status**: pending
- **Files**: `extensions/vscode/src/extension.ts`, `extensions/vscode/src/test/extension-runtime-paths.spec.ts`, `packages/client/src/lib/contracts/interfaces/resolved-capability.interface.ts`, `packages/client/src/lib/services/agent-catalog-service.ts`, `packages/client/src/lib/transport/tool-reach.helper.ts`, `packages/client/tests/services/agent-catalog-sections.spec.ts`, `packages/client/tests/transport/tool-reach.spec.ts`
- **Gate**: type
- acceptance:
  - "The extension finds the server under any casing of its `.mcp.json` entry, and the Tools, Proposals and Memory views fill from a real server."

### S3 — The dashboard answers what is happening now
- **Status**: pending
- **Files**: `extensions/vscode/src/providers/dashboard-webview-view-provider.ts`
- **Gate**: type
- acceptance:
  - "The dashboard shows live units, publications and their checks, what the queue is doing, blocked mutations with their cause, and current token use, refreshed by events and not by polling every panel."

### S4 — The layout works in a side bar
- **Status**: pending
- **Files**: `extensions/vscode/src/providers/dashboard-webview-view-provider.ts`
- **Gate**: type
- acceptance:
  - "The Dashboard view shows its content at side-bar width: its navigation does not cover it."

### S5 — A test drives the extension against a real server
- **Status**: pending
- **Files**: `extensions/vscode/src/test/build-smoke.spec.ts`
- **Gate**: type
- acceptance:
  - "A spec activates the built extension against a real server in a throwaway project and reads a populated view model."

### S6 — One dashboard with everything, and it remembers the viewer
- **Status**: pending
- **Files**: `extensions/vscode/package.json`, `extensions/vscode/src/providers/dashboard-webview-view-provider.ts`
- **Gate**: type
- acceptance:
  - "The extension has one view, the Dashboard, with sections for tools, proposals, memory, plugins, agents and KPIs; the separate panels are gone and every section loads its data."
  - "The language, the theme and the section chosen are remembered across reloads, in one store the sections all read."

## acceptance

- Every view refreshes when the client connects or reconnects, and a view never stays on a connecting message once the server answers.
- Every call reaches the server through the shared client, with no router of the extension's own.
- A connection that fails says why and is tried again.
- The extension finds the server under any casing of its `.mcp.json` entry, and the Tools, Proposals and Memory views fill from a real server.
- The dashboard shows live units, publications and their checks, what the queue is doing, blocked mutations with their cause, and current token use, refreshed by events and not by polling every panel.
- The Dashboard view shows its content at side-bar width: its navigation does not cover it.
- A spec activates the built extension against a real server in a throwaway project and reads a populated view model.

## notes
- 2026-11-02: the panels failed because the extension routed every call through `delendai_vertex`, a router the server no longer exposes, in 70 lines that repeated the shared client. For a later slice: the `DelendAI Runtime` channel replays 77,611 history lines on every load.
- 2026-11-02: the real bundle driven in Node against a real server found what fake clients could not: the launch lookup was case-sensitive and missed the `DelendAI` entry of `.mcp.json`, falling back to a command that is no server; the catalog was asked whole at 312 KB when a view needs one section; and a resolved tool's summary was read instead of its structured content. S2 fixes the three, and the tree views fill. The owner asked for S6: four panels look bad.
