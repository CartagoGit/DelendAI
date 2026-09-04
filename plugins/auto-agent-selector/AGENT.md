# AGENT.md — plugin `plugins/auto-agent-selector`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation).

## Public API

- discoverRoster
- discoverAndPersistRoster
- realDiscoveryDeps
- installKnownCli
- type IProviderInstallResult
- realRosterSnapshotStore
- type IRosterSnapshotStore
- rankProviders
- buildDashboard
- buildEscalationLadder
- runWithEscalation
- buildAutoEvaluateRegistration
- KNOWN_APIS
- KNOWN_CLIS

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/auto-agent-selector/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/auto-agent-selector/tests/src/lib/calibrate/store.spec.ts
- plugins/auto-agent-selector/tests/src/lib/calibrate/win-rates.spec.ts
- plugins/auto-agent-selector/tests/src/lib/dashboard/view-model.spec.ts
- plugins/auto-agent-selector/tests/src/lib/discovery/discover-roster.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `mcp-vertex_auto-agent-selector_auto_run` — 2,646 B total, 1,796 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)

<!-- mcp-vertex:end agent-md -->

