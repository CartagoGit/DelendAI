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

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_project-kpis_project_kpis` — 4,093 B total, 2,816 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

