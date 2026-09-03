# AGENT.md — plugin `plugins/project-kpis`

> Below the `<!-- mcp-vertex:begin agent-md -->
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

- @mcp-vertex/project-health
- @mcp-vertex/usage-tracking
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/project-kpis/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/project-kpis/tests/project-kpis.e2e.spec.ts
- plugins/project-kpis/tests/src/audit-report.spec.ts
- plugins/project-kpis/tests/src/kpi-aggregation.spec.ts
- plugins/project-kpis/tests/src/kpi-history.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- plugins/project-kpis/src/lib/contracts/kpi-snapshot.schema.ts
- plugins/project-kpis/src/lib/tools/project-kpis-output.schema.ts

<!-- mcp-vertex:end agent-md -->

