---
id: f00047
kind: feat
title: Multi-surface budget gates + compact-first consumers
status: done
type: proposal
track: core+client+extensions/vscode+plugins+metrics+docs
date: 2026-06-21
---

# f00047 — Multi-surface budget gates + compact-first consumers

## Goal

Close the bounded-but-not-yet-budgeted gaps surfaced by a00027 S4: extend token/cost baselines beyond cold-start, and make client/host consumers prefer compact/default-cheap surfaces where the server already exposes them.

## why

- a00027 S4 confirmed that several server surfaces are already strongly bounded, but the measured/gated budget story still stops too early at cold-start.
- The next leverage is split across two layers: extend the budget baseline, and stop consumers from defaulting to expensive full views where compact ones already exist.
- This proposal keeps both halves tied together so measured budgets and compact-first consumption evolve in the same slice set.

## non-goals

- Replacing the existing overview/search/docs/logs/proposals surface contracts.
- Reworking host UX beyond what is needed to make bounded results honest and cheap by default.
- Duplicating the longitudinal metrics gate already shipped in f00027 instead of building on it.

## Slices

- global_gate: type

### S1 — Budget baseline beyond cold-start
- **Files**: docs/TOKEN-BUDGETS.md, tools/scripts/metrics/collect-candidate.script.ts, tools/scripts/metrics/diff-snapshots.script.ts, packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
- **Status**: done
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "The documented budget baseline expands beyond overview/auto_work to at least the read-only surfaces that dominate long sessions: search, docs, logs and round-context or equivalent."
  - "Where possible, the same metrics pipeline used by f00027 is reused rather than duplicated."
  - "The repo documents which surfaces are bounded but still not budget-gated."

### S2 — Compact-first defaults in client and host consumers
- **Files**: packages/client/src/lib/services/overview-service.ts, packages/client/src/lib/services/dashboard-service.ts, extensions/vscode/src/commands/tool-search.ts, extensions/vscode/src/commands/show-overview.ts, extensions/vscode/src/providers/memory-tree-data-provider.ts
- **Status**: done
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "Client and VS Code consumers prefer compact/default-cheap server surfaces where available instead of overview full by default."
  - "Any bounded host-side truncation or pagination exposes overflow or next-page intent instead of silently pretending completeness."
  - "The token panel avoids fixed heuristics when a measured value or clearer caveat is available."

### S3 — Cache freshness and cheap-check validation
- **Files**: packages/client/tests/services/overview-service.spec.ts, packages/client/tests/services/dashboard-service.spec.ts, extensions/vscode/src/test/tool-search.spec.ts, extensions/vscode/src/test/commands.spec.ts, extensions/vscode/src/test/memory-commands.spec.ts
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Host/client cheap-check surfaces stay explicitly cheap and their role in avoiding expensive reads is documented or tested."
  - "At least one cache-related host path gains explicit freshness expectations or tests instead of silent manual refresh semantics only."
  - "bun run validate is green."

## acceptance

- The documented budget baseline expands beyond cold-start to the read-only surfaces that dominate long sessions.
- Client and host consumers prefer compact/default-cheap surfaces where the server already supports them.
- Cache freshness or overflow semantics become clearer where current consumers silently hide cost or incompleteness.
- `bun run validate` is green.

## notes

### Closure — 2026-06-21

- Carver verified S1 was already implemented and identified S2/S3 gaps.
- S2 now makes `OverviewService.listTools`, dashboard overview, VS Code tool search and VS Code overview compact-first.
- S3 now test-covers compact overview calls and adds a visible memory overflow node when the host list is truncated.
- Verified with targeted vitest, `bun run typecheck`, and `bun run validate`.
