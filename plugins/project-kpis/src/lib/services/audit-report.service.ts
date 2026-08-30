import type {
	IInvocationRecord,
	IUsageSummary,
} from '@mcp-vertex/usage-tracking/public';

import type {
	IKpiHistoryReadResult,
	IKpiTrendReport,
} from '../contracts/kpi-history.interface';
import type { IKpiSnapshot } from '../contracts/kpi-snapshot.interface';

/** Extended invocation shape read from the persisted telemetry log. */
interface IKpiAuditRecord extends IInvocationRecord {
	readonly requestType?: string;
	readonly latencyMs?: number | null;
	readonly errorTelemetry?: {
		readonly classification?: string;
		readonly incongruence?: boolean;
	} | null;
	readonly dimensions?: {
		readonly requestType?: string | null;
	} | null;
}

const KPI_AUDIT_FINDING_SEVERITIES = ['info', 'warning', 'error'] as const;
export type TKpiAuditFindingSeverity =
	(typeof KPI_AUDIT_FINDING_SEVERITIES)[number];

export type TKpiAuditStatus =
	| 'measured'
	| 'estimated'
	| 'partial'
	| 'unavailable'
	| 'not-configured';

interface IAuditFinding {
	readonly id: string;
	readonly severity: TKpiAuditFindingSeverity;
	readonly status: TKpiAuditStatus;
	readonly summary: string;
	readonly evidence: string;
	readonly recommendation?: string;
}

interface IAuditReportWindow {
	readonly from: string;
	readonly to: string;
	readonly windowDays: number;
}

interface IAuditReport {
	readonly contract: 'project-kpis.audit';
	readonly version: 1;
	readonly generatedAt: string;
	readonly status: TKpiAuditStatus;
	readonly source: string;
	readonly window: IAuditReportWindow;
	readonly counts: {
		readonly total: number;
		readonly info: number;
		readonly warning: number;
		readonly error: number;
	};
	readonly findings: readonly IAuditFinding[];
	readonly note?: string;
}

interface IAuditReportOptions {
	readonly snapshot: IKpiSnapshot;
	readonly history: IKpiHistoryReadResult;
	readonly trend: IKpiTrendReport;
	readonly records: readonly IKpiAuditRecord[];
	readonly summary: IUsageSummary | null;
	readonly window: IAuditReportWindow;
	readonly now?: Date;
	readonly staleSnapshotMs?: number;
	readonly pluginErrorRateThreshold?: number;
	readonly minPluginCalls?: number;
}

const DAY_MS = 86_400_000;
const DEFAULT_PLUGIN_ERROR_RATE_THRESHOLD = 0.2;
const DEFAULT_MIN_PLUGIN_CALLS = 3;

const asIsoString = (value: Date): string => value.toISOString();

const severityOf = (finding: IAuditFinding): TKpiAuditFindingSeverity =>
	finding.severity;

const statusOf = (findings: readonly IAuditFinding[]): TKpiAuditStatus => {
	if (findings.length === 0) return 'measured';
	if (findings.some((finding) => finding.severity === 'error')) {
		return 'partial';
	}
	if (findings.some((finding) => finding.severity === 'warning')) {
		return 'partial';
	}
	return 'measured';
};

const countBySeverity = (findings: readonly IAuditFinding[]) => {
	const counts = { total: findings.length, info: 0, warning: 0, error: 0 };
	for (const finding of findings) {
		const severity = severityOf(finding);
		counts[severity] = (counts[severity] ?? 0) + 1;
	}
	return counts;
};

const errorClassificationOf = (record: IKpiAuditRecord): string | null => {
	const telemetry =
		record.errorTelemetry === undefined || record.errorTelemetry === null
			? null
			: record.errorTelemetry;
	if (telemetry !== null && telemetry.classification !== undefined) {
		return telemetry.classification;
	}
	return record.error !== null ? 'tool-error' : null;
};

const errorRateByPlugin = (
	records: readonly IKpiAuditRecord[],
): ReadonlyMap<string, { readonly calls: number; readonly errors: number }> => {
	const groups = new Map<
		string,
		{ readonly calls: number; readonly errors: number }
	>();
	for (const record of records) {
		const current = groups.get(record.plugin) ?? { calls: 0, errors: 0 };
		groups.set(record.plugin, {
			calls: current.calls + 1,
			errors: current.errors + (record.outcome === 'error' ? 1 : 0),
		});
	}
	return groups;
};

/**
 * Build a bounded, evidence-backed audit report over a single KPI window.
 * The report never invents data: every finding is derived from the local
 * snapshot, persisted history, trend report and invocation telemetry that
 * were passed in, and each carries its own evidence string so consumers can
 * decide whether to act on it.
 */
export const buildAuditReport = (
	options: IAuditReportOptions,
): IAuditReport => {
	const now = options.now ?? new Date();
	const generatedAt = asIsoString(now);
	const staleSnapshotMs =
		options.staleSnapshotMs ?? options.window.windowDays * DAY_MS;
	const errorRateThreshold =
		options.pluginErrorRateThreshold ?? DEFAULT_PLUGIN_ERROR_RATE_THRESHOLD;
	const minPluginCalls = options.minPluginCalls ?? DEFAULT_MIN_PLUGIN_CALLS;

	const findings: IAuditFinding[] = [];
	const query = options.window;

	// 1. No local evidence at all — stay explicit instead of inventing data.
	if (options.records.length === 0 && options.history.entries.length === 0) {
		findings.push({
			id: 'no-local-evidence',
			severity: 'info',
			status: 'not-configured',
			summary:
				'No invocation telemetry or persisted history was available for the selected window.',
			evidence: `Queried ${query.from}..${query.to}: records=${options.records.length}, history entries=${options.history.entries.length}.`,
			recommendation:
				'Enable usage-tracking recording and persist KPI snapshots before treating audit findings as evidence.',
		});
	}

	// 2. Schema/result incongruences surface as structured error telemetry.
	const incongruent = options.records.filter(
		(record) =>
			record.errorTelemetry?.incongruence === true ||
			errorClassificationOf(record) === 'schema-incongruence',
	);
	if (incongruent.length > 0) {
		findings.push({
			id: 'schema-incongruence',
			severity: 'error',
			status: 'measured',
			summary:
				'Schema/result incongruences were observed in the invocation telemetry window.',
			evidence: `${incongruent.length} incongruent invocation(s) between ${query.from} and ${query.to}.`,
			recommendation:
				'Inspect the underlying tool contracts and the errors view before trusting the affected KPI slices.',
		});
	}

	// 3. Unexplained failures: error outcomes without a usable classification.
	const unexplained = options.records.filter(
		(record) =>
			record.outcome === 'error' &&
			errorClassificationOf(record) === null,
	);
	if (unexplained.length > 0) {
		findings.push({
			id: 'unexplained-failures',
			severity: 'warning',
			status: 'measured',
			summary:
				'Some error outcomes lacked a structured error classification.',
			evidence: `${unexplained.length} unexplained error outcome(s) in the selected window.`,
			recommendation:
				'Attach an error classification (and correlation id) to failing invocations so failures can be triaged and rolled up.',
		});
	}

	// 4. Missing telemetry dimensions degrade dimension-level KPI views.
	if (
		options.records.length > 0 &&
		options.records.every((record) => record.model === null)
	) {
		findings.push({
			id: 'model-attribution-missing',
			severity: 'warning',
			status: 'partial',
			summary:
				'Invocation telemetry exists but model attribution is missing for the selected window.',
			evidence: `${options.records.length} invocation(s) were observed and none carried a model descriptor.`,
			recommendation:
				'Enable model attribution in the host or orchestrator path before using model-level KPI views.',
		});
	}
	const missingRequestType = options.records.filter(
		(record) =>
			(record.requestType ?? record.dimensions?.requestType ?? null) ===
			null,
	);
	if (
		options.records.length > 0 &&
		missingRequestType.length > 0 &&
		missingRequestType.length === options.records.length
	) {
		findings.push({
			id: 'request-type-missing',
			severity: 'info',
			status: 'partial',
			summary:
				'None of the invocations carried a request type dimension.',
			evidence: `${options.records.length} invocation(s) with requestType unset.`,
			recommendation:
				'Stamp the request category on invocations so request-type breakdowns become available.',
		});
	}

	// 5. Stale snapshot: generated before the observed window.
	const snapshotAgeMs =
		now.getTime() - Date.parse(options.snapshot.generatedAt);
	if (
		Number.isFinite(snapshotAgeMs) &&
		snapshotAgeMs > staleSnapshotMs &&
		options.snapshot.health.status !== 'not-configured'
	) {
		findings.push({
			id: 'stale-snapshot',
			severity: 'warning',
			status: 'partial',
			summary: 'The KPI snapshot is older than the requested window.',
			evidence: `Snapshot generated ${options.snapshot.generatedAt} (${Math.round(snapshotAgeMs / DAY_MS)} day(s) old) for a ${query.windowDays}-day window.`,
			recommendation:
				'Refresh the snapshot before relying on current health and usage baselines.',
		});
	}

	// 6. Plugin-level error anomalies (only when enough samples exist).
	for (const [plugin, bucket] of errorRateByPlugin(options.records)) {
		if (bucket.calls < minPluginCalls) continue;
		const errorRate = bucket.errors / bucket.calls;
		if (errorRate <= errorRateThreshold) continue;
		findings.push({
			id: `plugin-error-anomaly:${plugin}`,
			severity: 'warning',
			status: 'measured',
			summary: `Plugin ${plugin} shows an elevated error rate in the selected window.`,
			evidence: `${bucket.errors}/${bucket.calls} calls failed (${Math.round(errorRate * 100)}%) against a ${Math.round(errorRateThreshold * 100)}% threshold.`,
			recommendation:
				'Review the failing tools of this plugin and its error classifications before extrapolating reliability trends.',
		});
	}

	// 7. Thin history: trends need at least two samples to be trustworthy.
	if (options.history.entries.length === 1) {
		findings.push({
			id: 'history-thin',
			severity: 'info',
			status: 'partial',
			summary:
				'Only one persisted history sample is available; trend directions are not yet computable.',
			evidence: `${options.history.entries.length} history entr(y/ies) in the selected window.`,
			recommendation:
				'Persist more KPI snapshots over time to unlock evidence-backed trend analysis.',
		});
	}

	return {
		contract: 'project-kpis.audit',
		version: 1,
		generatedAt,
		status: statusOf(findings),
		source: 'project-kpis/S7',
		window: query,
		counts: countBySeverity(findings),
		findings,
	};
};
