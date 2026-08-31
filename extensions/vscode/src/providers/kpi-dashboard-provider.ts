import { renderKpiDashboard } from '../../../../packages/ui-extension/src/kpi-dashboard';
import type {
	IKpiDashboardMetric,
	IKpiDashboardModel,
	IKpiDashboardRow,
	IKpiDashboardSection,
	IKpiDashboardTrendCard,
	TKpiDashboardMetricStatus,
	TKpiDashboardViewState,
} from '../../../../packages/ui-extension/src/kpi-dashboard';
import type { IWebviewPanel } from '@mcp-vertex/ui-extension/public';

import { KPI_DASHBOARD_MESSAGE_SCHEMA } from '../contracts/constants/kpi-dashboard-message-schema.constant';
import {
	KPI_DASHBOARD_VIEWS,
	KPI_DASHBOARD_WINDOW_OPTIONS,
	type IKpiDashboardLoadedView,
	type IKpiDashboardProvider,
	type IKpiDashboardProviderDeps,
	type IKpiDashboardQuery,
	type IKpiDashboardResolvedState,
	type IKpiDashboardToolBreakdown,
	type IKpiDashboardToolBreakdownItem,
	type IKpiDashboardToolDisplayMetric,
	type IKpiDashboardToolFinding,
	type IKpiDashboardToolHistoryEntry,
	type IKpiDashboardToolIssue,
	type IKpiDashboardToolOutput,
	type TKpiDashboardDetail,
	type TKpiDashboardViewName,
	type TKpiDashboardWindowDays,
} from '../contracts/interfaces/kpi-dashboard.interface';

const DEFAULT_VIEW_ID = 'mcp-vertex.kpis';
const DEFAULT_QUERY: IKpiDashboardQuery = {
	windowDays: 7,
	detail: 'standard',
};

const DISCONNECTED_RE =
	/(failed to call mcp tool|transport|connect|connection|closed|socket|econn|timed out)/i;

const formatToolName = (prefix: string | undefined, suffix: string): string => {
	const trimmed = prefix?.trim();
	if (trimmed === undefined || trimmed.length === 0) {
		return `mcp-vertex_${suffix}`;
	}
	return `${trimmed.endsWith('_') ? trimmed : `${trimmed}_`}${suffix}`;
};

const asMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const isDisconnectedError = (error: unknown): boolean =>
	DISCONNECTED_RE.test(asMessage(error));

const isMetricStatus = (value: string): value is TKpiDashboardMetricStatus =>
	[
		'measured',
		'estimated',
		'partial',
		'unavailable',
		'not-configured',
		'provider-reported',
		'configured-estimate',
		'subscription',
	].includes(value);

const metricStatusOf = (value: string): TKpiDashboardMetricStatus =>
	isMetricStatus(value) ? value : 'unavailable';

const stateFromStatus = (
	status: string | undefined,
	fallback: TKpiDashboardViewState = 'unavailable',
): TKpiDashboardViewState => {
	if (status === 'measured' || status === 'estimated') return 'ready';
	if (status === 'partial') return 'partial';
	if (status === 'not-configured' || status === 'unavailable') {
		return 'unavailable';
	}
	return fallback;
};

const metricFrom = (
	metric: IKpiDashboardToolDisplayMetric,
	overrides: Partial<IKpiDashboardMetric> = {},
): IKpiDashboardMetric => ({
	key: metric.key,
	label: metric.label,
	status: metricStatusOf(metric.status),
	unit: metric.unit,
	source: metric.source,
	...(metric.value !== undefined ? { value: metric.value } : {}),
	...(metric.observedAt !== undefined
		? { observedAt: metric.observedAt }
		: {}),
	...(metric.note !== undefined ? { note: metric.note } : {}),
	...overrides,
});

const displayMetricByKey = (
	view: IKpiDashboardToolOutput | undefined,
	key: string,
): IKpiDashboardToolDisplayMetric | undefined =>
	view?.snapshot?.highlights.find((metric) => metric.key === key);

const historyPoints = (
	entries: readonly IKpiDashboardToolHistoryEntry[],
	selector: (entry: IKpiDashboardToolHistoryEntry) => number | undefined,
	statusSelector: (
		entry: IKpiDashboardToolHistoryEntry,
	) => TKpiDashboardMetricStatus,
): Array<{
	readonly at: string;
	readonly label: string;
	readonly value?: number;
	readonly status: TKpiDashboardMetricStatus;
}> =>
	entries.map((entry) => {
		const value = selector(entry);
		return {
			at: entry.generatedAt,
			label: entry.generatedAt.slice(5, 10),
			...(value !== undefined ? { value } : {}),
			status: statusSelector(entry),
		};
	});

const dayBreakdown = (
	view: IKpiDashboardToolOutput | undefined,
): IKpiDashboardToolBreakdown | undefined =>
	view?.breakdowns?.find((breakdown) => breakdown.dimension === 'day');

const firstBreakdown = (
	view: IKpiDashboardToolOutput | undefined,
	excludeDimension?: string,
): IKpiDashboardToolBreakdown | undefined =>
	view?.breakdowns?.find(
		(breakdown) => breakdown.dimension !== excludeDimension,
	);

const rowValuesFromBreakdownItem = (
	item: IKpiDashboardToolBreakdownItem,
): IKpiDashboardRow['values'] => {
	const values: Array<IKpiDashboardRow['values'][number]> = [];
	if (item.calls !== undefined) {
		values.push({ label: 'Calls', value: String(item.calls) });
	}
	if (item.errors !== undefined) {
		values.push({
			label: 'Errors',
			value: String(item.errors),
			tone: item.errors > 0 ? 'danger' : 'default',
		});
	}
	if (item.totalTokens !== undefined) {
		values.push({ label: 'Tokens', value: String(item.totalTokens) });
	}
	if (item.costUsd !== undefined) {
		values.push({
			label: 'Cost',
			value: `$${item.costUsd.toFixed(item.costUsd < 10 ? 2 : 0)}`,
		});
	}
	if (item.tokensSaved !== undefined) {
		values.push({ label: 'Saved', value: String(item.tokensSaved) });
	}
	if (item.averageLatencyMs !== undefined && item.averageLatencyMs !== null) {
		values.push({
			label: 'Avg ms',
			value: item.averageLatencyMs.toFixed(0),
			tone: 'muted',
		});
	}
	if (item.utilityPer1kTokens !== undefined) {
		values.push({
			label: 'Utility/1k',
			value: item.utilityPer1kTokens.toFixed(2),
			tone: 'muted',
		});
	}
	return values;
};

const rowsFromBreakdown = (
	breakdown: IKpiDashboardToolBreakdown | undefined,
	limit = 6,
): IKpiDashboardRow[] => {
	if (breakdown === undefined) return [];
	return breakdown.items.slice(0, limit).map((item) => ({
		key: `${breakdown.dimension}:${item.key}`,
		label: item.key,
		...(item.lastSeenAt !== undefined && item.lastSeenAt !== null
			? { subtitle: `Last seen ${item.lastSeenAt}` }
			: {}),
		state: stateFromStatus(item.status, 'empty'),
		values: rowValuesFromBreakdownItem(item),
		...(item.note !== undefined ? { note: item.note } : {}),
	}));
};

const rowsFromIssues = (
	issues: readonly IKpiDashboardToolIssue[] | undefined,
	limit = 5,
): IKpiDashboardRow[] =>
	(issues ?? []).slice(0, limit).map((item, index) => ({
		key: `issue:${index}:${item.classification}`,
		label: item.classification,
		subtitle: `${item.plugin}/${item.tool}`,
		state: item.outcome === 'error' ? 'partial' : 'ready',
		values: [
			{ label: 'Outcome', value: item.outcome, tone: 'danger' },
			{ label: 'Request', value: item.requestType, tone: 'muted' },
			{ label: 'At', value: item.ts.slice(0, 10), tone: 'muted' },
		],
		note: item.message,
	}));

const rowsFromFindings = (
	findings: readonly IKpiDashboardToolFinding[] | undefined,
	limit = 5,
): IKpiDashboardRow[] =>
	(findings ?? []).slice(0, limit).map((item) => ({
		key: `finding:${item.id}`,
		label: item.summary,
		subtitle: item.id,
		state:
			item.severity === 'error'
				? 'partial'
				: item.severity === 'warning'
					? 'partial'
					: 'ready',
		values: [
			{
				label: 'Severity',
				value: item.severity,
				tone: item.severity === 'error' ? 'danger' : 'muted',
			},
			{ label: 'Status', value: item.status, tone: 'muted' },
		],
		note: item.recommendation ?? item.evidence,
	}));

const section = (input: IKpiDashboardSection): IKpiDashboardSection => input;

const buildTrendCards = (
	historyView: IKpiDashboardToolOutput | undefined,
	errorsView: IKpiDashboardToolOutput | undefined,
): IKpiDashboardTrendCard[] => {
	const entries = historyView?.history?.entries ?? [];
	const dayErrors = dayBreakdown(errorsView);
	const errorSeriesPoints =
		dayErrors?.items.map((item) => ({
			at: item.key,
			label: item.key.slice(5),
			...(item.errors !== undefined ? { value: item.errors } : {}),
			status: metricStatusOf(item.status),
		})) ?? [];
	return [
		{
			id: 'score',
			title: 'Score trend',
			state:
				entries.length >= 2
					? 'ready'
					: historyView === undefined
						? 'unavailable'
						: 'partial',
			note:
				historyView?.history?.note ??
				'Trend uses persisted history entries and stays partial until at least two samples exist.',
			series: [
				{
					key: 'health.score',
					label: 'Health score',
					unit: 'score',
					status: entries.length === 0 ? 'unavailable' : 'estimated',
					points: historyPoints(
						entries,
						(entry) => entry.healthScore,
						() => 'estimated',
					),
				},
			],
		},
		{
			id: 'coverage',
			title: 'Coverage trend',
			state: 'unavailable',
			note: 'Coverage is not exposed by the current project_kpis contract, so the dashboard renders an explicit unavailable state instead of a synthetic percentage.',
			series: [
				{
					key: 'coverage.missing',
					label: 'Coverage',
					unit: 'ratio',
					status: 'unavailable',
					points: [],
					note: 'No evidence-backed coverage samples are available.',
				},
			],
		},
		{
			id: 'tokens-cost',
			title: 'Tokens & cost',
			state: entries.some((entry) => entry.totalTokens !== undefined)
				? 'ready'
				: 'partial',
			note:
				historyView?.history?.note ??
				'Tokens come from persisted history; cost remains absent when providers do not report or estimate it.',
			series: [
				{
					key: 'usage.totalTokens',
					label: 'Tokens',
					unit: 'tokens',
					status: entries.length === 0 ? 'unavailable' : 'measured',
					points: historyPoints(
						entries,
						(entry) => entry.totalTokens,
						() => 'measured',
					),
				},
				{
					key: 'economics.costUsd',
					label: 'Cost USD',
					unit: 'usd',
					status: entries.some((entry) => entry.costUsd !== undefined)
						? 'provider-reported'
						: 'unavailable',
					points: historyPoints(
						entries,
						(entry) => entry.costUsd,
						(entry) => metricStatusOf(entry.costUsdStatus),
					),
				},
			],
		},
		{
			id: 'calls-errors',
			title: 'Calls & errors',
			state:
				entries.length > 0 || errorSeriesPoints.length > 0
					? 'ready'
					: 'partial',
			note:
				dayErrors?.note ??
				'Calls use persisted history; errors use the day breakdown from the errors view when raw invocation telemetry exists.',
			series: [
				{
					key: 'usage.calls',
					label: 'Calls',
					unit: 'count',
					status: entries.length === 0 ? 'unavailable' : 'measured',
					points: historyPoints(
						entries,
						(entry) => entry.calls,
						() => 'measured',
					),
				},
				{
					key: 'usage.errors',
					label: 'Errors',
					unit: 'count',
					status:
						errorSeriesPoints.length === 0 ? 'partial' : 'measured',
					points: errorSeriesPoints,
				},
			],
		},
	];
};

const dedupeRecommendations = (
	views: readonly IKpiDashboardLoadedView[],
): IKpiDashboardModel['recommendations'] => {
	const seen = new Set<string>();
	const items: Array<IKpiDashboardModel['recommendations'][number]> = [];
	for (const view of views) {
		for (const recommendation of view.output?.recommendations ?? []) {
			const key = `${recommendation.tool}:${recommendation.reason}`;
			if (seen.has(key)) continue;
			seen.add(key);
			items.push(recommendation);
		}
	}
	return items.slice(0, 8);
};

const collectLimitations = (
	views: readonly IKpiDashboardLoadedView[],
): string[] => {
	const seen = new Set<string>();
	const limitations: string[] = [];
	for (const view of views) {
		for (const limitation of view.output?.privacy.limitations ?? []) {
			if (seen.has(limitation)) continue;
			seen.add(limitation);
			limitations.push(limitation);
		}
	}
	return limitations;
};

const buildSections = (
	views: ReadonlyMap<TKpiDashboardViewName, IKpiDashboardToolOutput>,
): IKpiDashboardSection[] => {
	const summaryView = views.get('summary');
	const usageView = views.get('usage');
	const economicsView = views.get('economics');
	const modelsView = views.get('models');
	const agentsView = views.get('agents');
	const pluginsView = views.get('plugins');
	const errorsView = views.get('errors');
	const efficiencyView = views.get('efficiency');
	const auditView = views.get('audit');
	const activationView = views.get('activation');
	const score = displayMetricByKey(summaryView, 'health.score');
	const calls = displayMetricByKey(summaryView, 'usage.calls');
	const errors = displayMetricByKey(summaryView, 'usage.errors');
	const toolErrorRate = displayMetricByKey(
		summaryView,
		'usage.toolErrorRate',
	);
	const totalTokens = displayMetricByKey(summaryView, 'usage.totalTokens');
	const costUsd = displayMetricByKey(summaryView, 'usage.costUsd');
	const tokenSavings = displayMetricByKey(summaryView, 'usage.tokensSaved');
	const successRate = displayMetricByKey(
		efficiencyView,
		'efficiency.successfulCallRate',
	);
	const memorySavings = displayMetricByKey(
		efficiencyView,
		'efficiency.memoryCompactionSavingsTokens',
	);
	const optionalNote = (
		note: string | undefined,
	): { readonly note?: string } => (note === undefined ? {} : { note });
	const activationMetric = (
		key: string,
		label: string,
		value: number | undefined,
		unit: IKpiDashboardToolDisplayMetric['unit'],
	): IKpiDashboardMetric | undefined =>
		value === undefined
			? undefined
			: {
					key,
					label,
					status: metricStatusOf(
						activationView?.activation?.status ??
							activationView?.status ??
							'unavailable',
					),
					unit,
					source:
						activationView?.activation?.source ?? 'activation-kpis',
					value,
				};
	return [
		section({
			id: 'health',
			title: 'Health',
			icon: '◉',
			state: score === undefined ? 'unavailable' : 'ready',
			note:
				summaryView?.snapshot?.note ??
				'Health score comes from project-health via the bounded KPI snapshot.',
			metrics: score === undefined ? [] : [metricFrom(score)],
			rows: [],
		}),
		section({
			id: 'delivery',
			title: 'Delivery',
			icon: '↗',
			state:
				summaryView?.snapshot?.note === undefined
					? 'unavailable'
					: 'partial',
			note:
				summaryView?.snapshot?.note ??
				'Delivery is present only as an explicit note in the current KPI contract; no numeric delivery metric is exposed yet.',
			metrics: [],
			rows: [],
		}),
		section({
			id: 'quality-coverage',
			title: 'Quality & coverage',
			icon: '△',
			state: 'unavailable',
			note: 'Neither quality sub-scores nor coverage percentages are exposed by project_kpis S5, so this section stays explicitly unavailable.',
			metrics: [],
			rows: [],
		}),
		section({
			id: 'usage',
			title: 'Usage',
			icon: '⌁',
			state: stateFromStatus(
				usageView?.status ?? summaryView?.status,
				'partial',
			),
			note:
				usageView?.summary ??
				'Usage metrics come from observed MCP invocation telemetry.',
			metrics: [calls, errors, toolErrorRate, totalTokens]
				.filter(
					(metric): metric is IKpiDashboardToolDisplayMetric =>
						metric !== undefined,
				)
				.map((metric) => metricFrom(metric)),
			rows: rowsFromBreakdown(firstBreakdown(usageView, 'day')),
		}),
		section({
			id: 'cost',
			title: 'Cost',
			icon: '$',
			state: stateFromStatus(
				economicsView?.status ?? summaryView?.status,
				'partial',
			),
			note:
				economicsView?.summary ??
				'Provider-reported or configured-estimate economics only; absent values stay absent.',
			metrics: [costUsd, tokenSavings]
				.filter(
					(metric): metric is IKpiDashboardToolDisplayMetric =>
						metric !== undefined,
				)
				.map((metric) => metricFrom(metric)),
			rows: rowsFromBreakdown(firstBreakdown(economicsView)),
		}),
		section({
			id: 'models',
			title: 'Models',
			icon: '◇',
			state: stateFromStatus(modelsView?.status, 'unavailable'),
			...optionalNote(modelsView?.summary),
			metrics: [],
			rows: rowsFromBreakdown(firstBreakdown(modelsView)),
		}),
		section({
			id: 'agents',
			title: 'Agents',
			icon: '⚑',
			state: stateFromStatus(agentsView?.status, 'unavailable'),
			...optionalNote(agentsView?.summary),
			metrics: [],
			rows: rowsFromBreakdown(firstBreakdown(agentsView)),
		}),
		section({
			id: 'plugins',
			title: 'Plugins',
			icon: '⊞',
			state: stateFromStatus(pluginsView?.status, 'unavailable'),
			...optionalNote(pluginsView?.summary),
			metrics: [],
			rows: rowsFromBreakdown(firstBreakdown(pluginsView)),
		}),
		section({
			id: 'errors',
			title: 'Errors',
			icon: '!',
			state:
				(errorsView?.issues?.items.length ?? 0) > 0
					? 'partial'
					: stateFromStatus(errorsView?.status, 'partial'),
			note:
				errorsView?.issues?.note ??
				errorsView?.summary ??
				'Structured issues remain empty when the selected window has no raw invocation evidence.',
			metrics: [],
			rows: [
				...rowsFromIssues(errorsView?.issues?.items),
				...rowsFromFindings(errorsView?.findings?.items, 3),
			],
		}),
		section({
			id: 'efficiency',
			title: 'Efficiency',
			icon: '≈',
			state: stateFromStatus(efficiencyView?.status, 'partial'),
			...optionalNote(efficiencyView?.summary),
			metrics: [successRate, memorySavings]
				.filter(
					(metric): metric is IKpiDashboardToolDisplayMetric =>
						metric !== undefined,
				)
				.map((metric) => metricFrom(metric)),
			rows: rowsFromBreakdown(firstBreakdown(efficiencyView)),
		}),
		section({
			id: 'audit',
			title: 'Audit',
			icon: '▣',
			state:
				(auditView?.findings?.items.length ?? 0) > 0
					? 'partial'
					: stateFromStatus(auditView?.status, 'partial'),
			note:
				auditView?.findings?.note ??
				auditView?.summary ??
				'Audit findings remain empty until the KPI tool surfaces evidence-backed anomalies.',
			metrics: [],
			rows: rowsFromFindings(auditView?.findings?.items),
		}),
		section({
			id: 'activation',
			title: 'Activation KPIs',
			icon: '◎',
			state: stateFromStatus(activationView?.status, 'unavailable'),
			note:
				activationView?.activation?.note ??
				activationView?.summary ??
				'Activation precision, recall and churn require persisted session evidence.',
			metrics: [
				activationMetric(
					'activation.sessionCount',
					'Sessions',
					activationView?.activation?.sessionCount,
					'count',
				),
				activationMetric(
					'activation.meanPrecision',
					'Mean precision',
					activationView?.activation?.meanPrecision,
					'ratio',
				),
				activationMetric(
					'activation.meanRecall',
					'Mean recall',
					activationView?.activation?.meanRecall,
					'ratio',
				),
				activationMetric(
					'activation.meanChurn',
					'Mean churn',
					activationView?.activation?.meanChurn,
					'ratio',
				),
			].filter(
				(metric): metric is IKpiDashboardMetric => metric !== undefined,
			),
			rows: [],
		}),
	];
};

const buildModel = (
	loadedViews: readonly IKpiDashboardLoadedView[],
	query: IKpiDashboardQuery,
): IKpiDashboardModel => {
	const available = new Map<TKpiDashboardViewName, IKpiDashboardToolOutput>();
	for (const view of loadedViews) {
		if (view.output !== undefined) {
			available.set(view.view, view.output);
		}
	}
	const summaryView = available.get('summary');
	const historyView = available.get('history');
	const errorsView = available.get('errors');
	const sections = buildSections(available);
	const summaryMetrics = [
		displayMetricByKey(summaryView, 'health.score'),
		displayMetricByKey(summaryView, 'usage.calls'),
		displayMetricByKey(summaryView, 'usage.totalTokens'),
		displayMetricByKey(summaryView, 'usage.costUsd'),
	]
		.filter(
			(metric): metric is IKpiDashboardToolDisplayMetric =>
				metric !== undefined,
		)
		.map((metric) => metricFrom(metric));
	const trends = buildTrendCards(historyView, errorsView);
	const errors = loadedViews
		.filter((view) => view.error !== undefined)
		.map((view) => `${view.view}: ${view.error}`);
	const disconnectedCount = loadedViews.filter(
		(view) => view.disconnected === true,
	).length;
	const loadedCount = available.size;
	const allSectionsEmpty = sections.every(
		(item) => item.rows.length === 0 && item.metrics.length === 0,
	);
	const state: TKpiDashboardViewState =
		loadedCount === 0
			? disconnectedCount > 0
				? 'disconnected'
				: 'unavailable'
			: allSectionsEmpty
				? 'empty'
				: errors.length > 0 ||
						sections.some(
							(item) =>
								item.state === 'partial' ||
								item.state === 'unavailable',
						)
					? 'partial'
					: 'ready';
	return {
		title: 'mcp-vertex Project KPIs',
		state,
		summary:
			summaryView?.summary ??
			'No KPI summary was returned by the project_kpis tool.',
		windowLabel: `${query.windowDays}-day window`,
		selectedWindowDays: query.windowDays,
		windows: KPI_DASHBOARD_WINDOW_OPTIONS.map((days) => ({
			days,
			label: `${days}d`,
			selected: days === query.windowDays,
		})),
		...(summaryView?.generatedAt !== undefined
			? { generatedAt: summaryView.generatedAt }
			: historyView?.generatedAt !== undefined
				? { generatedAt: historyView.generatedAt }
				: {}),
		summaryMetrics,
		trends,
		sections,
		recommendations: dedupeRecommendations(loadedViews),
		limitations: collectLimitations(loadedViews),
		errors,
	};
};

const loadingModel = (query: IKpiDashboardQuery): IKpiDashboardModel => ({
	title: 'mcp-vertex Project KPIs',
	state: 'loading',
	summary: 'Loading KPI views.',
	windowLabel: `${query.windowDays}-day window`,
	selectedWindowDays: query.windowDays,
	windows: KPI_DASHBOARD_WINDOW_OPTIONS.map((days) => ({
		days,
		label: `${days}d`,
		selected: days === query.windowDays,
	})),
	summaryMetrics: [],
	trends: [],
	sections: [],
	recommendations: [],
	limitations: [],
	errors: [],
});

const notConfiguredModel = (query: IKpiDashboardQuery): IKpiDashboardModel => ({
	...loadingModel(query),
	state: 'unavailable',
	summary:
		'Configure mcp-vertex.server.command and server.args to load project KPIs.',
});

export const buildKpiDashboardModel = async (
	deps: Pick<IKpiDashboardProviderDeps, 'client' | 'namespacePrefix'>,
	query: IKpiDashboardQuery,
): Promise<IKpiDashboardResolvedState> => {
	const tool = formatToolName(deps.namespacePrefix, 'project_kpis');
	// S3: detect whether the KPI plugin is even loaded. The dashboard
	// contract is owned by `project-kpis`, which is opt-in via
	// `mcp-vertex.config.json`. In a workspace that did not enable it,
	// the proxy still resolves the tool name but the server returns
	// `Tool … not found`. Probe once, surface a clear English
	// unavailable state, and skip the per-view fan-out so the user
	// does not see five identical "tool not found" errors.
	let toolAvailable = true;
	try {
		const probe = await deps.client.request<
			{ readonly limit?: number },
			{ readonly entries: readonly unknown[] }
		>(formatToolName(deps.namespacePrefix, 'tool_search'), {
			limit: 100,
		});
		toolAvailable =
			Array.isArray(probe.entries) &&
			probe.entries.some(
				(entry) =>
					(entry as { readonly pluginId?: string }).pluginId ===
					'project-kpis',
			);
	} catch {
		toolAvailable = false;
	}
	if (!toolAvailable) {
		const unavailableModel: IKpiDashboardResolvedState = {
			query,
			model: {
				...notConfiguredModel(query),
				summary:
					'The project-kpis plugin is not enabled in this workspace. Add it under plugins in mcp-vertex.config.json or open the Configuration Center to see usage_report and observability metrics instead.',
			},
			loadedViews: [],
		};
		return unavailableModel;
	}
	const argsFor = (
		view: TKpiDashboardViewName,
	): {
		readonly view: TKpiDashboardViewName;
		readonly detail: TKpiDashboardDetail;
		readonly windowDays: number;
		readonly dimensions?: readonly string[];
	} => ({
		view,
		detail: query.detail,
		windowDays: query.windowDays,
		...(view === 'errors'
			? { dimensions: ['day', 'error', 'outcome'] as const }
			: view === 'usage'
				? { dimensions: ['day', 'plugin', 'agent'] as const }
				: {}),
	});
	const loadedViews = await Promise.all(
		KPI_DASHBOARD_VIEWS.map(
			async (view): Promise<IKpiDashboardLoadedView> => {
				try {
					const output = await deps.client.request<
						ReturnType<typeof argsFor>,
						IKpiDashboardToolOutput
					>(tool, argsFor(view));
					return { view, output };
				} catch (error) {
					return {
						view,
						error: asMessage(error),
						disconnected: isDisconnectedError(error),
					};
				}
			},
		),
	);
	return {
		query,
		loadedViews,
		model: buildModel(loadedViews, query),
	};
};

export class KpiDashboardProvider implements IKpiDashboardProvider {
	private view: IWebviewPanel | undefined;
	private query: IKpiDashboardQuery;
	private lastState: IKpiDashboardResolvedState | undefined;
	private refreshToken = 0;
	private readonly client: IKpiDashboardProviderDeps['client'];
	private readonly namespacePrefix: string | undefined;
	private readonly serverConfigured: boolean;

	constructor(
		options: Pick<
			IKpiDashboardProviderDeps,
			'client' | 'namespacePrefix' | 'defaultQuery' | 'serverConfigured'
		>,
	) {
		this.client = options.client;
		this.namespacePrefix = options.namespacePrefix;
		this.serverConfigured = options.serverConfigured ?? true;
		this.query = {
			windowDays:
				(options.defaultQuery?.windowDays as
					| TKpiDashboardWindowDays
					| undefined) ?? DEFAULT_QUERY.windowDays,
			detail: options.defaultQuery?.detail ?? DEFAULT_QUERY.detail,
		};
	}

	getState(): IKpiDashboardResolvedState | undefined {
		return this.lastState;
	}

	async resolveWebviewView(webview: IWebviewPanel): Promise<void> {
		this.view = webview;
		this.view.webview.setHtml(
			renderKpiDashboard(
				this.serverConfigured
					? loadingModel(this.query)
					: notConfiguredModel(this.query),
			),
		);
		this.view.webview.onDidReceiveMessage?.(async (message: unknown) => {
			const parsed = KPI_DASHBOARD_MESSAGE_SCHEMA.safeParse(message);
			if (!parsed.success) return;
			if (parsed.data.command === 'setWindowDays') {
				this.query = {
					...this.query,
					windowDays: parsed.data.windowDays,
				};
			}
			await this.refresh();
		});
		await this.refresh();
	}

	async refresh(): Promise<void> {
		if (!this.serverConfigured) {
			this.lastState = {
				query: this.query,
				loadedViews: [],
				model: notConfiguredModel(this.query),
			};
			this.view?.webview.setHtml(
				renderKpiDashboard(this.lastState.model),
			);
			return;
		}
		const token = ++this.refreshToken;
		this.view?.webview.setHtml(
			renderKpiDashboard(loadingModel(this.query)),
		);
		const next = await buildKpiDashboardModel(
			{
				client: this.client,
				...(this.namespacePrefix === undefined
					? {}
					: { namespacePrefix: this.namespacePrefix }),
			},
			this.query,
		);
		if (token !== this.refreshToken) return;
		this.lastState = next;
		this.view?.webview.setHtml(renderKpiDashboard(next.model));
	}
}

/**
 * Register the KPI dashboard view. Returns the live
 * `KpiDashboardProvider` so the host can invoke `refresh()` from the
 * global refresh command, plus the disposable the host should track.
 */
export const registerKpiDashboardProvider = (
	deps: IKpiDashboardProviderDeps,
): {
	readonly provider: KpiDashboardProvider;
	readonly dispose: () => void;
} => {
	const provider = new KpiDashboardProvider({
		client: deps.client,
		...(deps.serverConfigured === undefined
			? {}
			: { serverConfigured: deps.serverConfigured }),
		...(deps.namespacePrefix === undefined
			? {}
			: { namespacePrefix: deps.namespacePrefix }),
		...(deps.defaultQuery === undefined
			? {}
			: { defaultQuery: deps.defaultQuery }),
	});
	const registration = deps.host.registerWebviewViewProvider?.(
		deps.viewId ?? DEFAULT_VIEW_ID,
		provider,
	);
	const dispose = (): void => {
		registration?.dispose?.();
	};
	return { provider, dispose };
};
