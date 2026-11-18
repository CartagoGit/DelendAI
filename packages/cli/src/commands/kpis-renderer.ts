import { formatRows } from '../lib/text-format.service';

import type {
	IToolFailureCode,
	IToolFailureRow,
} from '../contracts/interfaces/tool-failure-row.interface';
import type { IKpiThreshold, TKpiCliView } from './kpis-options';

export interface IKpiRenderedMetric {
	readonly key: string;
	readonly label: string;
	readonly status: string;
	readonly source: string;
	readonly unit: string;
	readonly value?: number | string;
	readonly observedAt?: string;
	readonly note?: string;
}

export interface IKpiRenderedTable {
	readonly title: string;
	readonly columns: readonly string[];
	readonly rows: readonly Record<string, string | number | boolean | null>[];
	readonly note?: string;
}

export interface IKpiViewPayload {
	readonly title: string;
	readonly subtitle?: string;
	readonly metrics: readonly IKpiRenderedMetric[];
	readonly tables: readonly IKpiRenderedTable[];
	readonly notes: readonly string[];
	readonly limitations: readonly string[];
}

export interface IKpiThresholdBreach {
	readonly metric: string;
	readonly operator: IKpiThreshold['operator'];
	readonly expected: number;
	readonly actual?: number;
	readonly raw: string;
	readonly reason?: string;
}

export interface IKpiCliReport {
	readonly contract: 'cli.kpis-report';
	readonly version: 1;
	readonly view: TKpiCliView;
	readonly availableViews: readonly TKpiCliView[];
	readonly generatedAt: string;
	readonly period: {
		readonly from: string;
		readonly to: string;
		readonly windowDays: number;
	};
	readonly sources: {
		readonly snapshot: {
			readonly available: boolean;
			readonly source: string;
		};
		readonly history: {
			readonly available: boolean;
			readonly source: string;
			readonly entries: number;
			readonly totalEntries: number;
		};
		readonly usageSummary: {
			readonly available: boolean;
			readonly source: string;
		};
		readonly telemetry: {
			readonly available: boolean;
			readonly source: string;
		};
	};
	readonly thresholds: {
		readonly configured: readonly IKpiThreshold[];
		readonly breached: boolean;
		readonly breaches: readonly IKpiThresholdBreach[];
	};
	readonly payload: IKpiViewPayload;
}

const formatNumber = (value: number, unit: string): string => {
	if (unit === 'usd') return `$${value.toFixed(4)}`;
	if (unit === 'ratio') return `${(value * 100).toFixed(2)}%`;
	if (unit === 'score') return `${value.toFixed(0)}/100`;
	if (Number.isInteger(value)) return `${value}`;
	return value.toFixed(3);
};

const formatMetricValue = (metric: IKpiRenderedMetric): string => {
	if (metric.value === undefined) return 'n/a';
	if (typeof metric.value === 'string') return metric.value;
	return formatNumber(metric.value, metric.unit);
};

const renderMetric = (metric: IKpiRenderedMetric): string => {
	const details = [
		`status=${metric.status}`,
		`source=${metric.source}`,
		`unit=${metric.unit}`,
		...(metric.observedAt !== undefined
			? [`observed=${metric.observedAt}`]
			: []),
	];
	return `${metric.label}: ${formatMetricValue(metric)} (${details.join(', ')})${metric.note !== undefined ? `\n  note: ${metric.note}` : ''}`;
};

const stringifyCell = (value: string | number | boolean | null): string => {
	if (value === null) return '—';
	if (typeof value === 'boolean') return value ? 'yes' : 'no';
	return String(value);
};

const renderTable = (table: IKpiRenderedTable): string => {
	const rows = table.rows.map((row) =>
		Object.fromEntries(
			table.columns.map((column) => [
				column,
				stringifyCell(row[column] ?? null),
			]),
		),
	);
	const blocks = [table.title, formatRows(rows, table.columns)];
	if (table.note !== undefined) blocks.push(`note: ${table.note}`);
	return blocks.join('\n');
};

export const renderKpiCliReport = (report: IKpiCliReport): string => {
	const lines: string[] = [
		`kpis ${report.view}`,
		`period: ${report.period.from} -> ${report.period.to} (${report.period.windowDays} day window)`,
		`generated: ${report.generatedAt}`,
		`payload: ${report.payload.title}`,
	];
	if (report.payload.subtitle !== undefined) {
		lines.push(`summary: ${report.payload.subtitle}`);
	}
	lines.push('');
	lines.push('sources:');
	lines.push(
		`  snapshot=${report.sources.snapshot.available ? 'available' : 'missing'} (${report.sources.snapshot.source})`,
	);
	lines.push(
		`  history=${report.sources.history.available ? 'available' : 'missing'} (${report.sources.history.entries}/${report.sources.history.totalEntries} entries from ${report.sources.history.source})`,
	);
	lines.push(
		`  usage-summary=${report.sources.usageSummary.available ? 'available' : 'missing'} (${report.sources.usageSummary.source})`,
	);
	lines.push(
		`  telemetry=${report.sources.telemetry.available ? 'available' : 'missing'} (${report.sources.telemetry.source})`,
	);
	if (report.thresholds.configured.length > 0) {
		lines.push('');
		lines.push('thresholds:');
		lines.push(
			`  status=${report.thresholds.breached ? 'breached' : 'ok'} (${report.thresholds.configured.length} configured)`,
		);
		for (const breach of report.thresholds.breaches) {
			lines.push(
				`  breach: ${breach.raw}${breach.actual !== undefined ? ` actual=${breach.actual}` : ''}${breach.reason !== undefined ? ` reason=${breach.reason}` : ''}`,
			);
		}
	}
	if (report.payload.metrics.length > 0) {
		lines.push('');
		lines.push('metrics:');
		for (const metric of report.payload.metrics) {
			lines.push(`  ${renderMetric(metric)}`);
		}
	}
	for (const table of report.payload.tables) {
		lines.push('');
		lines.push(renderTable(table));
	}
	if (report.payload.notes.length > 0) {
		lines.push('');
		lines.push('notes:');
		for (const note of report.payload.notes) lines.push(`  - ${note}`);
	}
	if (report.payload.limitations.length > 0) {
		lines.push('');
		lines.push('limitations:');
		for (const limitation of report.payload.limitations) {
			lines.push(`  - ${limitation}`);
		}
	}
	return `${lines.join('\n')}\n`;
};

const sortValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value === null || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, sortValue(entry)]),
	);
};

export const renderKpiCliReportJsonLine = (report: IKpiCliReport): string =>
	`${JSON.stringify(sortValue(report))}\n`;

/** Failure codes shown per tool in `kpis --failures`. */
const TOP_FAILURE_CODES = 5;

interface IFailureEventLike {
	readonly ts?: unknown;
	readonly kind?: unknown;
	readonly toolName?: unknown;
	readonly failure?: { readonly class?: unknown; readonly code?: unknown };
}

/** Runtime events (JSONL) of one project folded per tool; bad lines are skipped. */
export const summariseToolFailures = (
	jsonl: string,
	sinceMs: number,
): readonly IToolFailureRow[] => {
	const tools = new Map<
		string,
		{
			calls: number;
			failures: number;
			codes: Map<string, IToolFailureCode>;
		}
	>();
	for (const line of jsonl.split('\n')) {
		if (line.trim() === '') continue;
		let event: IFailureEventLike;
		try {
			event = JSON.parse(line) as IFailureEventLike;
		} catch {
			continue;
		}
		if (event.kind !== 'tool.completed' && event.kind !== 'tool.failed')
			continue;
		if (typeof event.toolName !== 'string') continue;
		const at = typeof event.ts === 'string' ? Date.parse(event.ts) : NaN;
		if (Number.isNaN(at) || at < sinceMs) continue;
		const entry = tools.get(event.toolName) ?? {
			calls: 0,
			failures: 0,
			codes: new Map<string, IToolFailureCode>(),
		};
		tools.set(event.toolName, entry);
		entry.calls += 1;
		if (event.kind !== 'tool.failed') continue;
		entry.failures += 1;
		const cls = event.failure?.class;
		const code = event.failure?.code;
		if (typeof cls !== 'string' || typeof code !== 'string') continue;
		const key = `${cls}\u0000${code}`;
		const known = entry.codes.get(key);
		entry.codes.set(key, {
			class: cls,
			code,
			count: (known?.count ?? 0) + 1,
		});
	}
	return [...tools.entries()]
		.map(([tool, entry]) => ({
			tool,
			calls: entry.calls,
			failures: entry.failures,
			failureShare:
				entry.calls === 0
					? 0
					: Math.round((entry.failures / entry.calls) * 1000) / 1000,
			topCodes: [...entry.codes.values()]
				.sort(
					(a, b) =>
						b.count - a.count ||
						a.code.localeCompare(b.code) ||
						a.class.localeCompare(b.class),
				)
				.slice(0, TOP_FAILURE_CODES),
		}))
		.filter((row) => row.failures > 0)
		.sort(
			(a, b) =>
				b.failures - a.failures ||
				b.failureShare - a.failureShare ||
				a.tool.localeCompare(b.tool),
		);
};

export const renderToolFailures = (
	rows: readonly IToolFailureRow[],
): string => {
	if (rows.length === 0) return 'kpis failures\nno tool failures recorded\n';
	const lines = ['kpis failures'];
	for (const row of rows) {
		lines.push(
			`${row.tool}: ${row.failures}/${row.calls} failed (${(row.failureShare * 100).toFixed(1)}%)`,
		);
		for (const code of row.topCodes) {
			lines.push(`  ${code.count}x [${code.class}] ${code.code}`);
		}
	}
	return `${lines.join('\n')}\n`;
};
