import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../contracts/interfaces/cli-command.interface';
import { kpisCommands, runKpisCommandBody } from './kpis.command';

const snapshot = {
	contract: 'project-kpis.snapshot',
	version: 1,
	generatedAt: '2026-08-29T12:00:00.000Z',
	windowDays: 7,
	health: {
		status: 'estimated',
		source: 'project-health',
		score: {
			status: 'estimated',
			unit: 'score',
			source: 'project-health',
			value: 82,
		},
		security: {
			status: 'estimated',
			unit: 'score',
			source: 'project-health',
			value: 80,
		},
		deps: {
			status: 'estimated',
			unit: 'score',
			source: 'project-health',
			value: 90,
		},
		quality: {
			status: 'estimated',
			unit: 'score',
			source: 'project-health',
			value: 85,
		},
		debt: {
			status: 'estimated',
			unit: 'score',
			source: 'project-health',
			value: 70,
		},
		next: [
			{
				tool: 'mcp-vertex_quality_run_quality',
				reason: 'Run the quality gate for fresh evidence.',
			},
		],
	},
	usage: {
		status: 'measured',
		source: 'usage-summary',
		calls: {
			status: 'measured',
			unit: 'count',
			source: 'usage-summary',
			value: 12,
		},
		errors: {
			status: 'measured',
			unit: 'count',
			source: 'usage-summary',
			value: 2,
		},
		toolErrorRate: {
			status: 'measured',
			unit: 'ratio',
			source: 'usage-summary',
			value: 2 / 12,
		},
		totalTokens: {
			status: 'measured',
			unit: 'tokens',
			source: 'usage-summary',
			value: 1024,
		},
		costUsd: {
			status: 'estimated',
			unit: 'usd',
			source: 'usage-summary',
			value: 0.42,
		},
		tokensSaved: {
			status: 'measured',
			unit: 'tokens',
			source: 'usage-summary',
			value: 200,
		},
		memoryCompactionSavingsTokens: {
			status: 'measured',
			unit: 'tokens',
			source: 'usage-summary',
			value: 80,
		},
		topPlugins: [
			{
				plugin: 'search',
				calls: 4,
				errors: 1,
				totalTokens: 300,
				costUsd: 0.1,
			},
			{
				plugin: 'docs',
				calls: 3,
				errors: 0,
				totalTokens: 200,
				costUsd: 0.08,
			},
		],
	},
	delivery: {
		status: 'not-configured',
		source: 'project-kpis/S1',
		note: 'Delivery KPIs are reserved for a later slice.',
	},
	bytes: 800,
	truncated: false,
} as const;

const history = {
	contract: 'project-kpis.history',
	version: 1,
	updatedAt: '2026-08-29T12:10:00.000Z',
	retentionDays: 30,
	entries: [
		{
			snapshot: {
				...snapshot,
				generatedAt: '2026-08-25T12:00:00.000Z',
				health: {
					...snapshot.health,
					score: { ...snapshot.health.score, value: 70 },
				},
				usage: {
					...snapshot.usage,
					calls: { ...snapshot.usage.calls, value: 8 },
					totalTokens: { ...snapshot.usage.totalTokens, value: 800 },
					costUsd: { ...snapshot.usage.costUsd, value: 0.3 },
					tokensSaved: { ...snapshot.usage.tokensSaved, value: 100 },
				},
			},
			persistedAt: '2026-08-25T12:05:00.000Z',
			economics: {
				costUsd: {
					status: 'configured-estimate',
					unit: 'usd',
					source: 'usage-summary',
					methodology: 'configured',
					confidence: 'estimated',
					value: 0.3,
				},
				tokenSavings: {
					status: 'provider-reported',
					unit: 'tokens',
					source: 'usage-summary',
					methodology: 'measured',
					confidence: 'measured',
					value: 100,
				},
				financialSavingsUsd: {
					status: 'unavailable',
					unit: 'usd',
					source: 'usage-summary',
					methodology: 'missing baseline',
					confidence: 'unavailable',
				},
			},
		},
		{
			snapshot,
			persistedAt: '2026-08-29T12:05:00.000Z',
			economics: {
				costUsd: {
					status: 'configured-estimate',
					unit: 'usd',
					source: 'usage-summary',
					methodology: 'configured',
					confidence: 'estimated',
					value: 0.42,
				},
				tokenSavings: {
					status: 'provider-reported',
					unit: 'tokens',
					source: 'usage-summary',
					methodology: 'measured',
					confidence: 'measured',
					value: 200,
				},
				financialSavingsUsd: {
					status: 'unavailable',
					unit: 'usd',
					source: 'usage-summary',
					methodology: 'missing baseline',
					confidence: 'unavailable',
				},
			},
		},
	],
} as const;

const usageSummary = {
	updatedAt: '2026-08-29T12:10:00.000Z',
	windowDays: 7,
	totals: {
		calls: 12,
		totalTokens: 1024,
		costUsd: 0.42,
		tokensSaved: 200,
		savingsPercent: 19.53,
		errors: 2,
		autoBypassed: 1,
	},
	pluginKpis: [
		{
			plugin: 'search',
			utilityPer1kTokens: 4.2,
			tokenTax: { totalBytes: 1800 },
			kpis: {
				toolErrorRate: 0.25,
				dynamicActivationSavingsBytes: 500,
				memoryCompactionSavingsTokens: 60,
			},
		},
	],
	kpis: {
		successfulCallRate: 10 / 12,
		dynamicActivationSavingsBytes: 500,
		memoryCompactionSavingsTokens: 80,
		memoryCompactionSavingsNote: 'observed',
		toolErrorRate: 2 / 12,
	},
	limitsStatus: {
		sessionSpendUsd: 0.42,
		sessionLimitUsd: 1,
		monthlySpendUsd: 0.42,
		monthlyLimitUsd: 10,
		breached: false,
	},
	degradations: [
		{
			at: '2026-08-28T10:00:00.000Z',
			scope: 'session',
			fromProvider: 'expensive',
			toProvider: 'cheap',
			observedUsd: 0.8,
			limitUsd: 0.5,
		},
	],
	invocationTelemetry: {
		totals: {
			calls: 12,
			successfulCalls: 10,
			failedCalls: 2,
			retries: 1,
			iterationsObserved: 1,
			totalTokens: 1024,
			costUsd: 0.42,
			withCorrelation: 11,
			schemaIncongruences: 1,
			averageLatencyMs: 120,
			p50LatencyMs: 100,
			p95LatencyMs: 210,
		},
		byPlugin: [
			{
				key: 'search',
				calls: 4,
				successfulCalls: 3,
				failedCalls: 1,
				retries: 1,
				iterationsObserved: 1,
				totalTokens: 300,
				costUsd: 0.1,
				averageLatencyMs: 100,
				p50LatencyMs: 90,
				p95LatencyMs: 140,
				lastSeenAt: '2026-08-29T11:59:00.000Z',
				latestError: 'tool-error',
			},
		],
		byModel: [
			{
				key: 'gpt-5.4',
				calls: 5,
				successfulCalls: 4,
				failedCalls: 1,
				retries: 1,
				iterationsObserved: 1,
				totalTokens: 700,
				costUsd: 0.22,
				averageLatencyMs: 130,
				p50LatencyMs: 120,
				p95LatencyMs: 180,
				lastSeenAt: '2026-08-29T11:58:00.000Z',
				latestError: 'tool-error',
			},
		],
		byAgent: [
			{
				key: 'copilot',
				calls: 8,
				successfulCalls: 7,
				failedCalls: 1,
				retries: 1,
				iterationsObserved: 1,
				totalTokens: 820,
				costUsd: 0.3,
				averageLatencyMs: 115,
				p50LatencyMs: 100,
				p95LatencyMs: 200,
				lastSeenAt: '2026-08-29T11:58:00.000Z',
				latestError: 'tool-error',
			},
		],
		byError: [
			{
				key: 'tool-error',
				calls: 2,
				successfulCalls: 0,
				failedCalls: 2,
				retries: 1,
				iterationsObserved: 1,
				totalTokens: 120,
				costUsd: 0.04,
				averageLatencyMs: 150,
				p50LatencyMs: 140,
				p95LatencyMs: 180,
				lastSeenAt: '2026-08-29T11:59:00.000Z',
				latestError: 'tool-error',
			},
		],
		issues: [
			{
				ts: '2026-08-29T11:59:00.000Z',
				plugin: 'search',
				tool: 'query',
				requestType: 'code-edit',
				outcome: 'error',
				correlationId: 'corr-1',
				classification: 'tool-error',
				code: 'ToolError',
				message: 'tool returned an error',
				incongruence: true,
				iteration: 1,
			},
		],
	},
} as const;

const buildStubContext = (): ICliCommandContext => ({
	cwd: '/workspace',
	globals: {
		workspace: '/workspace',
		json: false,
		format: 'text',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async <TOut>(tool: string): Promise<TOut> => {
		if (tool !== 'mcp-vertex_project_kpis') {
			throw new Error(`unexpected tool: ${tool}`);
		}
		return snapshot as TOut;
	},
	listTools: async () => [],
	close: async () => {},
});

const runtime = {
	pathExists: (path: string): boolean =>
		path.endsWith('history.json') || path.endsWith('usage-summary.json'),
	readTextFile: async (path: string): Promise<string> => {
		if (path.endsWith('history.json')) return JSON.stringify(history);
		if (path.endsWith('usage-summary.json'))
			return JSON.stringify(usageSummary);
		throw new Error(`unexpected path: ${path}`);
	},
	wait: async () => {},
	now: () => new Date('2026-08-29T12:10:00.000Z'),
} as const;

const find = (name: string): ICliCommand => {
	const command = kpisCommands.find((entry) => entry.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('kpis command', () => {
	it('exports the standalone kpis command', () => {
		expect(kpisCommands.map((entry) => entry.name)).toEqual(['kpis']);
	});

	it('renders a scannable human summary by default', async () => {
		const result = await find('kpis').run([], buildStubContext());
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.text ?? '').toContain('kpis summary');
		expect(result.text ?? '').toContain('status=estimated');
		expect(result.text ?? '').toContain('source=project-health');
		expect(result.text ?? '').toContain('limitations:');
	});

	it('returns stable structured data in json mode', async () => {
		const ctx = buildStubContext();
		const result = await runKpisCommandBody(
			['--json', '--view=plugins'],
			ctx,
			runtime,
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		const report = result.data as {
			view: string;
			payload: { tables: { rows: { plugin: string }[] }[] };
		};
		expect(report.view).toBe('plugins');
		expect(report.payload.tables[0]?.rows[0]?.plugin).toBe('search');
	});

	it('projects telemetry-backed model and error views without recomputing raw logs', async () => {
		const ctx = buildStubContext();
		const models = await runKpisCommandBody(
			['--json', 'models'],
			ctx,
			runtime,
		);
		const errors = await runKpisCommandBody(
			['--json', 'errors'],
			ctx,
			runtime,
		);
		const modelsReport = models.data as {
			payload: { tables: { rows: { key: string }[] }[] };
		};
		const errorsReport = errors.data as {
			payload: {
				metrics: { key: string }[];
				tables: { rows: { classification?: string }[] }[];
			};
		};
		expect(modelsReport.payload.tables[0]?.rows[0]?.key).toBe('gpt-5.4');
		expect(
			errorsReport.payload.metrics.map((metric) => metric.key),
		).toContain('telemetry.failedCalls');
		expect(errorsReport.payload.tables[1]?.rows[0]?.classification).toBe(
			'tool-error',
		);
	});

	it('fails validation when a configured threshold is breached', async () => {
		const ctx = buildStubContext();
		const result = await runKpisCommandBody(
			['--json', '--threshold=health.score>=90'],
			ctx,
			runtime,
		);
		expect(result.code).toBe(EXIT_CODE.VALIDATION);
		const report = result.data as {
			thresholds: { breached: boolean; breaches: { raw: string }[] };
		};
		expect(report.thresholds.breached).toBe(true);
		expect(report.thresholds.breaches[0]?.raw).toBe('health.score>=90');
	});

	it('streams repeated watch frames and suppresses default printing when watch ends', async () => {
		const ctx = buildStubContext();
		const writes: string[] = [];
		const result = await runKpisCommandBody(
			['--watch', '--json', '--watch-interval-ms=1'],
			ctx,
			{
				...runtime,
				write: (chunk: string) => writes.push(chunk),
				maxPasses: 2,
				isTty: false,
			},
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.suppressDefaultPrint).toBe(true);
		expect(writes).toHaveLength(2);
		expect(writes[0]).toContain('cli.kpis-report');
	});
});
