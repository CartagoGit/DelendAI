/**
 * Public surface of `@delendai/project-kpis`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the KPI tool builder, schemas and versioned contracts for programmatic use.
 */
export { default } from '../index';

export {
	buildProjectKpisToolRegistrations,
	ProjectKpisOutputSchema,
	runProjectKpis,
} from '../lib/tools/project-kpis.tool';
export type {
	IKpiAggregationOptions,
	IKpiDeliverySection,
	IKpiHealthSection,
	IKpiMetric,
	IKpiNextAction,
	IKpiSnapshot,
	IKpiTopPlugin,
	IKpiUsageSection,
	TKpiMetricUnit,
	TKpiValueStatus,
} from '../lib/contracts/kpi-snapshot.interface';
export type {
	IKpiHistoryEntry,
	IKpiHistoryPersistOptions,
	IKpiHistoryReadResult,
	IKpiTrendMetric,
	IKpiTrendOptions,
	IKpiTrendReport,
} from '../lib/contracts/kpi-history.interface';
export type {
	IKpiQuery,
	IKpiQueryFilter,
	IProjectKpisToolOptions,
	TKpiDetailLevel,
	TKpiDimension,
	TProjectKpiView,
} from '../lib/contracts/kpi-query.interface';
export {
	buildKpiSnapshot,
	DEFAULT_KPI_MAX_BYTES,
	DEFAULT_KPI_WINDOW_DAYS,
} from '../lib/services/kpi-aggregation.service';
export { buildKpiTrendReport } from '../lib/services/kpi-trends.service';
export {
	DEFAULT_KPI_HISTORY_RETENTION_DAYS,
	DEFAULT_KPI_HISTORY_WINDOW_DAYS,
	persistKpiSnapshotHistory,
	readKpiHistoryWindow,
} from '../lib/services/kpi-history.service';
