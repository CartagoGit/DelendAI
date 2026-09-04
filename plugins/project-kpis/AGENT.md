# AGENT.md — plugin `plugins/project-kpis`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Versioned project KPI snapshots and observability views across health, usage, economics and delivery.

## Public API

- default
- buildProjectKpisToolRegistrations
- ProjectKpisOutputSchema
- runProjectKpis
- buildKpiSnapshot
- DEFAULT_KPI_MAX_BYTES
- DEFAULT_KPI_WINDOW_DAYS
- buildKpiTrendReport
- DEFAULT_KPI_HISTORY_RETENTION_DAYS
- DEFAULT_KPI_HISTORY_WINDOW_DAYS
- persistKpiSnapshotHistory
- readKpiHistoryWindow

## Depends on

- @delendai/project-health
- @delendai/usage-tracking
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/project-kpis/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/project-kpis/tests/project-kpis.e2e.spec.ts
- plugins/project-kpis/tests/src/audit-report.spec.ts
- plugins/project-kpis/tests/src/kpi-aggregation.spec.ts
- plugins/project-kpis/tests/src/kpi-history.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_project-kpis_project_kpis` — 4,273 B total, 2,895 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

