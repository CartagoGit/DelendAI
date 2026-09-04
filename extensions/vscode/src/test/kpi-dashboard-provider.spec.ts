import { describe, expect, it } from 'vitest';

import {
	KpiDashboardProvider,
	buildKpiDashboardModel,
} from '../providers/kpi-dashboard-provider';
import type {
	KpiDashboardMessage,
	IKpiDashboardToolOutput,
} from '../contracts/interfaces/kpi-dashboard.interface';

import type { IWebviewPanel } from '@delendai/ui-extension/public';

class FakeWebviewPanel implements IWebviewPanel {
	readonly id = 'fake-kpi-webview';
	readonly options = { enableScripts: true };
	visible = true;
	private messageHandler:
		| ((message: unknown) => void | Promise<void>)
		| undefined;
	readonly webview = {
		html: '',
		options: this.options,
		setHtml: (html: string): void => {
			this.webview.html = html;
		},
		onDidReceiveMessage: (
			handler: (message: unknown) => void | Promise<void>,
		) => {
			this.messageHandler = handler;
			return { dispose() {} };
		},
	};
	reveal(): void {
		this.visible = true;
	}
	dispose(): void {
		this.visible = false;
	}
	onDidDispose() {
		return { dispose() {} };
	}
	async post(message: KpiDashboardMessage | unknown): Promise<void> {
		await this.messageHandler?.(message);
	}
}

const baseOutput = (
	view: IKpiDashboardToolOutput['view'],
	partial: Partial<IKpiDashboardToolOutput> = {},
): IKpiDashboardToolOutput => ({
	contract: 'project-kpis.view',
	version: 1,
	view,
	detail: 'standard',
	status: 'measured',
	generatedAt: '2026-08-29T12:00:00.000Z',
	window: {
		from: '2026-08-22T12:00:00.000Z',
		to: '2026-08-29T12:00:00.000Z',
		windowDays: 7,
		limit: 10,
	},
	dimensions: ['plugin'],
	filter: {},
	summary: `${view} summary`,
	sources: [
		{
			id: view,
			kind: 'snapshot',
			status: 'measured',
			observedAt: '2026-08-29T12:00:00.000Z',
		},
	],
	privacy: {
		observedMcpOnly: true,
		limitations: ['Metadata only.'],
	},
	recommendations: [
		{
			tool: 'mcp-vertex_project_kpis',
			priority: 'next',
			reason: `inspect ${view}`,
		},
	],
	bytes: 400,
	truncated: false,
	...partial,
});

const createFixtures = (): Record<string, IKpiDashboardToolOutput> => ({
	summary: baseOutput('summary', {
		summary:
			'Health 84, 12 calls, 420 tokens, $1.30 observed in the selected window.',
		snapshot: {
			status: 'measured',
			source: 'project-kpis.snapshot',
			generatedAt: '2026-08-29T12:00:00.000Z',
			windowDays: 7,
			highlights: [
				{
					key: 'health.score',
					label: 'Health score',
					status: 'estimated',
					unit: 'score',
					source: 'test/health',
					value: 84,
				},
				{
					key: 'usage.calls',
					label: 'Calls',
					status: 'measured',
					unit: 'count',
					source: 'test/usage',
					value: 12,
				},
				{
					key: 'usage.errors',
					label: 'Errors',
					status: 'measured',
					unit: 'count',
					source: 'test/usage',
					value: 2,
				},
				{
					key: 'usage.toolErrorRate',
					label: 'Tool error rate',
					status: 'measured',
					unit: 'ratio',
					source: 'test/usage',
					value: 0.1667,
				},
				{
					key: 'usage.totalTokens',
					label: 'Total tokens',
					status: 'measured',
					unit: 'tokens',
					source: 'test/usage',
					value: 420,
				},
				{
					key: 'usage.costUsd',
					label: 'Cost USD',
					status: 'measured',
					unit: 'usd',
					source: 'test/usage',
					value: 1.3,
				},
				{
					key: 'usage.tokensSaved',
					label: 'Token savings',
					status: 'measured',
					unit: 'tokens',
					source: 'test/usage',
					value: 55,
				},
			],
			note: 'Delivery metrics are currently note-only.',
		},
	}),
	history: baseOutput('history', {
		history: {
			status: 'measured',
			source: 'history.json',
			entries: [
				{
					generatedAt: '2026-08-27T12:00:00.000Z',
					persistedAt: '2026-08-27T12:10:00.000Z',
					healthScore: 80,
					calls: 7,
					totalTokens: 200,
					costUsdStatus: 'provider-reported',
					costUsd: 0.9,
					tokenSavingsStatus: 'provider-reported',
					tokenSavings: 20,
					financialSavingsUsdStatus: 'unavailable',
				},
				{
					generatedAt: '2026-08-28T12:00:00.000Z',
					persistedAt: '2026-08-28T12:10:00.000Z',
					healthScore: 82,
					calls: 9,
					totalTokens: 260,
					costUsdStatus: 'provider-reported',
					costUsd: 1.1,
					tokenSavingsStatus: 'provider-reported',
					tokenSavings: 28,
					financialSavingsUsdStatus: 'unavailable',
				},
				{
					generatedAt: '2026-08-29T12:00:00.000Z',
					persistedAt: '2026-08-29T12:10:00.000Z',
					healthScore: 84,
					calls: 12,
					totalTokens: 420,
					costUsdStatus: 'provider-reported',
					costUsd: 1.3,
					tokenSavingsStatus: 'provider-reported',
					tokenSavings: 55,
					financialSavingsUsdStatus: 'unavailable',
				},
			],
			trends: [],
		},
	}),
	usage: baseOutput('usage', {
		dimensions: ['day', 'plugin', 'agent'],
		breakdowns: [
			{
				dimension: 'day',
				status: 'measured',
				source: 'usage/day',
				totalItems: 3,
				items: [
					{
						key: '2026-08-27',
						status: 'measured',
						calls: 2,
						errors: 1,
					},
					{
						key: '2026-08-28',
						status: 'measured',
						calls: 4,
						errors: 0,
					},
					{
						key: '2026-08-29',
						status: 'measured',
						calls: 6,
						errors: 1,
					},
				],
			},
			{
				dimension: 'plugin',
				status: 'measured',
				source: 'usage/plugin',
				totalItems: 2,
				items: [
					{
						key: 'project-health',
						status: 'measured',
						calls: 7,
						errors: 1,
						totalTokens: 200,
						costUsd: 0.9,
					},
					{
						key: 'usage-tracking',
						status: 'measured',
						calls: 5,
						errors: 1,
						totalTokens: 220,
						costUsd: 0.4,
					},
				],
			},
		],
	}),
	economics: baseOutput('economics', {
		breakdowns: [
			{
				dimension: 'plugin',
				status: 'measured',
				source: 'economics/plugin',
				totalItems: 2,
				items: [
					{
						key: 'project-health',
						status: 'measured',
						costUsd: 0.9,
						tokensSaved: 20,
						calls: 7,
					},
					{
						key: 'usage-tracking',
						status: 'measured',
						costUsd: 0.4,
						tokensSaved: 35,
						calls: 5,
					},
				],
			},
		],
	}),
	models: baseOutput('models', {
		breakdowns: [
			{
				dimension: 'model',
				status: 'measured',
				source: 'models',
				totalItems: 1,
				items: [
					{
						key: 'openai/gpt-5.4',
						status: 'measured',
						calls: 12,
						errors: 2,
						totalTokens: 420,
						costUsd: 1.3,
					},
				],
			},
		],
	}),
	agents: baseOutput('agents', {
		breakdowns: [
			{
				dimension: 'agent',
				status: 'measured',
				source: 'agents',
				totalItems: 1,
				items: [
					{
						key: 'github-copilot',
						status: 'measured',
						calls: 12,
						errors: 2,
						totalTokens: 420,
					},
				],
			},
		],
	}),
	plugins: baseOutput('plugins', {
		breakdowns: [
			{
				dimension: 'plugin',
				status: 'measured',
				source: 'plugins',
				totalItems: 2,
				items: [
					{
						key: 'project-health',
						status: 'measured',
						calls: 7,
						errors: 1,
						totalTokens: 200,
						costUsd: 0.9,
						utilityPer1kTokens: 1.8,
					},
				],
			},
		],
	}),
	errors: baseOutput('errors', {
		status: 'partial',
		dimensions: ['day', 'error', 'outcome'],
		breakdowns: [
			{
				dimension: 'day',
				status: 'measured',
				source: 'errors/day',
				totalItems: 3,
				items: [
					{ key: '2026-08-27', status: 'measured', errors: 1 },
					{ key: '2026-08-28', status: 'measured', errors: 0 },
					{ key: '2026-08-29', status: 'measured', errors: 1 },
				],
			},
		],
		issues: {
			status: 'measured',
			source: 'issues',
			items: [
				{
					ts: '2026-08-29T09:10:00.000Z',
					plugin: 'usage-tracking',
					tool: 'usage_report',
					requestType: 'tool-call',
					outcome: 'error',
					classification: 'schema-incongruence',
					correlationId: 'corr-1',
					message: 'structured content did not match schema',
					incongruence: true,
					iteration: 2,
				},
			],
		},
	}),
	efficiency: baseOutput('efficiency', {
		snapshot: {
			status: 'measured',
			source: 'efficiency/snapshot',
			generatedAt: '2026-08-29T12:00:00.000Z',
			windowDays: 7,
			highlights: [
				{
					key: 'efficiency.successfulCallRate',
					label: 'Successful call rate',
					status: 'measured',
					unit: 'ratio',
					source: 'efficiency',
					value: 0.8333,
				},
				{
					key: 'efficiency.memoryCompactionSavingsTokens',
					label: 'Memory compaction savings',
					status: 'measured',
					unit: 'tokens',
					source: 'efficiency',
					value: 14,
				},
			],
		},
		breakdowns: [
			{
				dimension: 'plugin',
				status: 'measured',
				source: 'efficiency/plugin',
				totalItems: 1,
				items: [
					{
						key: 'project-health',
						status: 'measured',
						calls: 7,
						utilityPer1kTokens: 1.8,
						averageLatencyMs: 42,
					},
				],
			},
		],
	}),
	audit: baseOutput('audit', {
		status: 'partial',
		findings: {
			status: 'measured',
			source: 'audit',
			items: [
				{
					id: 'history-missing-baseline',
					severity: 'warning',
					status: 'partial',
					summary:
						'Need more persisted history for stronger comparisons.',
					evidence: 'Only three persisted snapshots exist.',
					recommendation:
						'Persist daily snapshots before relying on audit deltas.',
				},
			],
		},
	}),
	activation: baseOutput('activation', {
		summary: 'Activation KPIs measured across 4 sessions.',
		activation: {
			status: 'measured',
			source: 'activation-kpis/.vscode/mcp-vertex/kpis.json',
			sessionCount: 4,
			meanPrecision: 0.75,
			meanRecall: 0.5,
			meanChurn: 0.25,
		},
	}),
});

describe('KpiDashboardProvider', () => {
	it('builds a model with the requested sections and honest unavailable coverage state', async () => {
		const fixtures = createFixtures();
		const calls: string[] = [];
		const result = await buildKpiDashboardModel(
			{
				client: {
					async request(_tool, args) {
						if (
							_tool === 'mcp-vertex_tool_search' ||
							(args as { view?: string }).view === undefined
						) {
							return {
								entries: [{ pluginId: 'project-kpis' }],
							};
						}
						calls.push(String((args as { view: string }).view));
						return fixtures[(args as { view: string }).view]!;
					},
				},
				namespacePrefix: 'mcp-vertex',
			},
			{ windowDays: 7, detail: 'standard' },
		);

		expect(calls).toHaveLength(11);
		expect(
			result.model.sections.map(
				(section: (typeof result.model.sections)[number]) => section.id,
			),
		).toEqual([
			'health',
			'delivery',
			'quality-coverage',
			'usage',
			'cost',
			'models',
			'agents',
			'plugins',
			'errors',
			'efficiency',
			'audit',
			'activation',
		]);
		const activation = result.model.sections.find(
			(section: (typeof result.model.sections)[number]) =>
				section.id === 'activation',
		);
		expect(activation?.metrics.map((metric) => metric.value)).toEqual([
			4, 0.75, 0.5, 0.25,
		]);
		expect(
			result.model.trends.map(
				(trend: (typeof result.model.trends)[number]) => trend.id,
			),
		).toEqual(['score', 'coverage', 'tokens-cost', 'calls-errors']);
		expect(
			result.model.sections.find(
				(section: (typeof result.model.sections)[number]) =>
					section.id === 'quality-coverage',
			)?.state,
		).toBe('unavailable');
		expect(result.model.summaryMetrics).toHaveLength(4);
		expect(result.model.state).toBe('partial');
	});

	it('renders and reacts to refresh and window-switch messages', async () => {
		const fixtures = createFixtures();
		const calls: Array<{ view: string; windowDays: number }> = [];
		const provider = new KpiDashboardProvider({
			client: {
				async request(_tool, args) {
					const request = args as {
						view: string;
						windowDays: number;
					};
					if (request.view === undefined) {
						return { entries: [{ pluginId: 'project-kpis' }] };
					}
					calls.push({
						view: request.view,
						windowDays: request.windowDays,
					});
					return {
						...fixtures[request.view]!,
						window: {
							...fixtures[request.view]!.window,
							windowDays: request.windowDays,
						},
					};
				},
			},
		});
		const panel = new FakeWebviewPanel();

		await provider.resolveWebviewView(panel);
		expect(panel.webview.html).toContain('Project KPIs');
		expect(panel.webview.html).toContain('Coverage trend');
		expect(panel.webview.html).toContain('Quality &amp; coverage');

		await panel.post({ command: 'setWindowDays', windowDays: 30 });
		expect(provider.getState()?.query.windowDays).toBe(30);
		expect(calls.at(-1)?.windowDays).toBe(30);

		const callsBeforeInvalid = calls.length;
		await panel.post({ command: 'bogus' });
		expect(calls.length).toBe(callsBeforeInvalid);

		await panel.post({ command: 'refresh' });
		expect(calls.length).toBeGreaterThan(callsBeforeInvalid);
	});

	it('surfaces a disconnected state when every KPI view fails at the transport layer', async () => {
		const provider = new KpiDashboardProvider({
			client: {
				async request(_tool, args) {
					if ((args as { view?: string }).view === undefined) {
						return { entries: [{ pluginId: 'project-kpis' }] };
					}
					throw new Error(
						'Failed to call MCP tool "mcp-vertex_project_kpis": connection closed',
					);
				},
			},
		});
		const panel = new FakeWebviewPanel();

		await provider.resolveWebviewView(panel);

		expect(provider.getState()?.model.state).toBe('disconnected');
		expect(panel.webview.html).toContain('Disconnected');
		expect(panel.webview.html).toContain('could not reach the MCP server');
	});
});
