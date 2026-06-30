---
id: f00081
status: ready
type: proposal
track: packages/client+host-integration
date: 2026-06-28
kind: feat
title: Namespace-aware client services — make `packages/client` portable across `--prefix=...` deployments
runner: unknown
model: unknown
scope: client-architecture
shipped-in: [52b24fd4, 4f725d0a, 43ac9b58]
related:
    - a00045 # audit post-merge que originó el hallazgo
    - f00056 # agent discovery — owns the namespacePrefix resolution in core
recan: []
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run test, expect: exit0 }
---

# f00081 — Namespace-aware client services

## goal

Make `packages/client`'s service layer accept a `namespacePrefix` at construction time so deployments using `--prefix=acme` (or any non-default prefix) do not silently fail on every IDE integration.

## why

Audit `a00045 H8` found that three services in `packages/client/src/lib/services/` hardcode the `mcp-vertex_` namespace in their `request(...)` calls:

- `overview.service.ts:22` → `'mcp-vertex_overview'`
- `dashboard.service.ts:92` → `'mcp-vertex_overview'`
- `notifications.service.ts:102` → `'mcp-vertex_notification_notify_status'`

No service constructor accepts `namespacePrefix`. If the server is started with `--prefix=acme` (a valid CLI flag per the assemble contract), every service call fails immediately. The package is de-facto tightly coupled to the default prefix.

The core already exposes `snap.namespacePrefix` (returned by `mcp-vertex_overview { compact: true }`) and the assemble CLI accepts `--prefix`. The client just needs to thread it through.

## non-goals

- No new tools, no new contracts, no new plugin.
- No breaking changes to existing default-prefix consumers (default = `'mcp-vertex_'` preserves current behaviour).
- No discovery mechanism — the caller (host extension, IDE plugin) reads the prefix from boot config and passes it in.

## slices

### S1 — Add `INamespacePrefix` to the client service contracts

Define an interface or type for the namespace prefix and add an optional `namespacePrefix?: string` parameter to each service constructor. Default to `'mcp-vertex_'` when omitted.

- **Status**: done
- **Files**:
    - `packages/client/src/lib/services/overview.service.ts` [MODIFY]
    - `packages/client/src/lib/services/dashboard.service.ts` [MODIFY]
    - `packages/client/src/lib/services/notifications.service.ts` [MODIFY]
    - `packages/client/src/lib/services/connection-health.service.ts` [MODIFY — also accepts the prefix because it pings tools]
    - one shared helper `packages/client/src/lib/services/_namespace.ts` [CREATE] exposing `formatToolName(prefix, suffix)` and `parsePrefix(raw)` with `prefix ?? 'mcp-vertex_'` semantics
- **Gate**: `bun run test`
- **Closes**: a00045 H8 (P2 → feat)
- **Landed**: commit `52b24fd4`. Added `_namespace.ts` (`formatToolName`,
  `parsePrefix`, `DEFAULT_NAMESPACE_PREFIX`), an optional `namespacePrefix`
  on the Overview/Notifications/ConnectionHealth constructors and a
  `namespacePrefix` option on `IDashboardServiceOptions`; every hardcoded
  `mcp-vertex_*` request in those four services is now composed via
  `formatToolName`. Exported the helpers from
  `packages/client/src/public/index.ts`. New spec
  `packages/client/src/tests/namespace-aware-services.spec.ts` (12 tests:
  default → `mcp-vertex_*`, custom → `<prefix>_*`, missing → default).

### S2 — Wire `namespacePrefix` through the VS Code host

The VS Code host already knows the prefix (it's the workspace's `mcp-vertex.config.json` `server.prefix` field, or the default). Pipe it through `McpStdioClient` construction and into the service constructors.

- **Status**: done
- **Files**:
    - `extensions/vscode/src/extension.ts` [MODIFY — read prefix from config, pass to client]
    - `extensions/vscode/src/host/vscode-host-adapter.ts` [MODIFY — accept prefix in constructor]
    - `extensions/vscode/src/test/*.spec.ts` [MODIFY — update test fixtures]
- **Gate**: `bun run test:vscode`
- **Closes**: feature completion for VS Code
- **Landed**: commit `4f725d0a`. Implementation deviated from the named
  file list: `vscode-host-adapter.ts` is the *UI* host adapter (the only
  file importing `vscode`) and constructs no MCP services, so it was left
  untouched. The prefix is instead resolved in `extension.ts` via a new
  exported `resolveNamespacePrefix(vscode)` reading
  `mcp-vertex.server.prefix` (declared as a new config contribution in
  `extensions/vscode/package.json`) and threaded into the Overview /
  Notifications services, the `McpVertexStatusBar` (which has its own
  direct `client.request` probes — `status-bar.ts` updated to use
  `formatToolName`), and the toolbar / overview / tool-search / dashboard
  commands via a new optional `namespacePrefix` on `ICommandDeps` /
  `IOpenDashboardDeps`. No existing `*.spec.ts` fixture needed editing
  (the default path is byte-for-byte unchanged); a new spec
  `extensions/vscode/src/test/namespace-prefix.spec.ts` (4 tests) covers
  `resolveNamespacePrefix` and the status bar's prefix-aware probes. Gate
  note: `bun run test:vscode` does not exist; ran the extension's own
  `vitest run` (27 files / 109 tests green) plus the full `bun run
  validate`.

### S3 — Document the prefix contract in `packages/client/README.md` and update the host integration guide

Add a section explaining the prefix flow:
1. Server reports its prefix via `mcp-vertex_overview { compact: true }`.
2. Client reads `namespacePrefix` from the overview result (or accepts it as a constructor argument).
3. Every `request(...)` call prefixes the tool name correctly.

- **Status**: done
- **Files**:
    - `packages/client/README.md` [MODIFY]
    - `docs/mcp-vertex/IDE-EXTENSION.md` [MODIFY — add "namespace-aware client" subsection]
    - `docs/mcp-vertex/examples/minimal-host/*` [MODIFY — show the new constructor signature]
- **Gate**: `bun run site:strict` (docs must not have broken links)
- **Closes**: feature completion for documentation
- **Landed**: commit `43ac9b58`. Added a "Namespace-aware services" section
  to `packages/client/README.md` (prefix flow + `formatToolName` /
  `parsePrefix` / per-service constructor examples) and a "Namespace-aware
  client" subsection to `docs/mcp-vertex/IDE-EXTENSION.md` (config example +
  the `mcp-vertex.server.prefix` flow). `docs/mcp-vertex/examples/minimal-host/`
  does not exist in the tree, so there was nothing to modify there — skipped
  as N/A rather than inventing a new example surface. Gate `bun run
  site:strict` green (exit 0).

## dependency graph

```
S1 ──► S2 ──► S3
```

S1 lands first (foundation). S2 depends on S1's API. S3 depends on S2's signature.

## acceptance

- A host that sets `--prefix=acme` at boot can call `OverviewService({ namespacePrefix: 'acme_' }).request(...)` and receive the correct `acme_overview` response.
- The default constructor `OverviewService()` continues to call `mcp-vertex_overview` (no behaviour change for existing consumers).
- `bun run validate` exits 0; existing tests still pass; new tests cover at least:
    - Default prefix produces `mcp-vertex_overview`.
    - Custom prefix produces `<custom>_overview`.
    - Missing prefix is treated as default.
- Docs are updated; no broken links.

## risks and mitigations

Low. The change is additive: every existing call site passes through `formatToolName(prefix ?? 'mcp-vertex_', suffix)` and the default matches current behaviour bit-for-bit. The only real risk is in `extensions/vscode` test fixtures; if a test was previously asserting the literal string `'mcp-vertex_overview'` it will need updating to assert `formatToolName(undefined, 'overview')` instead.