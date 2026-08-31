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
- @mcp-vertex/core

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

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

