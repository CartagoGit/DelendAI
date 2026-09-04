# AGENT.md — plugin `plugins/orchestrator-runner`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Orchestrator-runner runtime utilities.

## Public API

- default
- scoreProvider
- explainScore
- MODE_TIER
- UNAVAILABLE_SCORE
- buildRoutingDecision
- strategyForKind
- type IAdviseInput
- SessionStore
- DEFAULT_SESSION_TTL_SECONDS
- DEFAULT_PRUNE_INTERVAL_MS
- type ISessionStoreOptions
- HealthStore
- buildProviderHealth

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/orchestrator-runner/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/orchestrator-runner/tests/e2e/fallback-chain.e2e.spec.ts
- plugins/orchestrator-runner/tests/e2e/invoke-real-subprocess.e2e.spec.ts
- plugins/orchestrator-runner/tests/src/lib/bootstrap.spec.ts
- plugins/orchestrator-runner/tests/src/lib/contracts/spend-view.contract.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_orchestrator-runner_format_handoff` — 1,951 B total, 282 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

