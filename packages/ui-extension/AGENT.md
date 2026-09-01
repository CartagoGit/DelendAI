# AGENT.md — package `packages/ui-extension`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Host-agnostic UI shell (dashboard, panels, command palette, brand assets) consumed by every @mcp-vertex extension host (vscode today; jetbrains, zed, cursor, antigravity tomorrow). Pure HTML + CSS + vanilla JS, no host imports.

## Public API

- ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET
- USAGE_TRACKING_OPT_IN_SNIPPET
- buildProviderStatusModel
- buildPluginSwitchboardModel
- buildUsageCostModel
- buildModelAttributionModel
- renderDashboard
- renderPanelAgents
- renderPanelMetrics
- renderPanelOverview
- renderPanelPlugins
- renderPanelSessions
- renderPanelTimes
- renderPanelTokens

## Depends on

- @mcp-vertex/client
- @mcp-vertex/shared
- zod

## Writes

_(none)_

## Entry points

_(none)_

## Tests

- packages/ui-extension/tests/contracts/interfaces/host-adapter.interface.spec.ts
- packages/ui-extension/tests/webview/csp.spec.ts
- packages/ui-extension/tests/settings/settings-schema.spec.ts
- packages/ui-extension/tests/settings/render-settings.spec.ts

## Do not

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

