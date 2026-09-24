# AGENT.md — plugin `plugins/auto-agent-selector`

> Below the `<!-- delendai:begin agent-md -->
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

- <host workspace>/.delendai/cache/auto-agent-selector/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/auto-agent-selector/tests/src/lib/calibrate/store.spec.ts
- plugins/auto-agent-selector/tests/src/lib/calibrate/win-rates.spec.ts
- plugins/auto-agent-selector/tests/src/lib/dashboard/view-model.spec.ts
- plugins/auto-agent-selector/tests/src/lib/discovery/discover-roster.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_auto-agent-selector_auto_run` — 2,572 B total, 1,744 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

