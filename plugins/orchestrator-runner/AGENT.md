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

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

