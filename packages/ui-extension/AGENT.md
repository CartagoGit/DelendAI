# AGENT.md — package `packages/ui-extension`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Host-agnostic UI shell (dashboard, panels, command palette, brand assets) consumed by every @delendai extension host (vscode today; jetbrains, zed, cursor, antigravity tomorrow). Pure HTML + CSS + vanilla JS, no host imports.

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

- @delendai/client
- @delendai/shared
- zod

## Writes

_(none)_

## Entry points

_(none)_

## Tests

- packages/ui-extension/src/strings/shared-ui-strings.spec.ts
- packages/ui-extension/src/toolbar/quick-actions.spec.ts
- packages/ui-extension/tests/components/disclosure.spec.ts
- packages/ui-extension/tests/components/dropdown.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

