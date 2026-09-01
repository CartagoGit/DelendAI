import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { regenerateSummary } from '@mcp-vertex/usage-tracking/public';

import { persistKpiSnapshotHistory } from '../../src/lib/services/kpi-history.service';
import {
	buildProjectKpisToolRegistrations,
	ProjectKpisOutputSchema,
	runProjectKpis,
} from '../../src/lib/tools/project-kpis.tool';

const CACHE_DIR = '.cache/mcp-vertex';
const createdRoots: string[] = [];

const metric = (
	status: 'measured' | 'estimated' | 'unavailable' | 'not-configured',
	unit: 'score' | 'count' | 'ratio' | 'tokens' | 'usd',
	source: string,
	value?: number,
	note?: string,
) => ({
	status,
	unit,
	source,
	...(value !== undefined ? { value } : {}),
	observedAt: '2026-08-29T12:00:00.000Z',
	...(note !== undefined ? { note } : {}),
});

const buildSnapshot = (options: {
	readonly generatedAt: string;
	readonly score: number;
	readonly calls: number;
	readonly totalTokens: number;
	readonly costUsd?: number;
	readonly tokenSavings?: number;
}) => ({
	contract: 'project-kpis.snapshot' as const,
	version: 1 as const,
	generatedAt: options.generatedAt,
	windowDays: 7,
	health: {
		status: 'estimated' as const,
		source: 'test/health',
		score: metric('estimated', 'score', 'test/health', options.score),
		security: metric('estimated', 'score', 'test/health', 80),
		deps: metric('estimated', 'score', 'test/health', 90),
		quality: metric('estimated', 'score', 'test/health', 88),
		debt: metric('estimated', 'score', 'test/health', 70),
		next: [
			{
				tool: 'mcp-vertex_quality_run_quality',
				reason: 'Quality execution is still required for ground truth.',
			},
		],
	},
	usage: {
		status: 'measured' as const,
		source: 'test/usage',
		calls: metric('measured', 'count', 'test/usage', options.calls),
		errors: metric('measured', 'count', 'test/usage', 1),
		toolErrorRate: metric('measured', 'ratio', 'test/usage', 0.25),
		totalTokens: metric(
			'measured',
			'tokens',
			'test/usage',
			options.totalTokens,
		),
		costUsd: metric(
			options.costUsd === undefined ? 'unavailable' : 'measured',
			'usd',
			'test/usage',
			options.costUsd,
		),
		tokensSaved: metric(
			options.tokenSavings === undefined ? 'unavailable' : 'measured',
			'tokens',
			'test/usage',
			options.tokenSavings,
		),
		memoryCompactionSavingsTokens: metric(
			'measured',
			'tokens',
			'test/usage',
			14,
		),
		topPlugins: [],
	},
	delivery: {
		status: 'not-configured' as const,
		source: 'test/delivery',
		note: 'deferred',
	},
	bytes: 512,
	truncated: false,
});

const setupWorkspace = async (
	cacheDirMode: 'relative' | 'absolute' = 'relative',
): Promise<{ root: string; cacheDir: string }> => {
	const root = await mkdtemp(join(tmpdir(), 'project-kpis-tool-'));
	createdRoots.push(root);
	const cacheDir =
		cacheDirMode === 'absolute' ? join(root, CACHE_DIR) : CACHE_DIR;
	const cacheDirAbs = isAbsolute(cacheDir) ? cacheDir : join(root, cacheDir);
	await mkdir(join(cacheDirAbs, 'results/usage-tracking'), {
		recursive: true,
	});
	const records = [
		{
			ts: '2026-08-29T09:00:00.000Z',
			sessionId: 's1',
			agent: {
				id: 'github-copilot',
				kind: 'copilot',
				extension: 'vscode-copilot',
			},
			plugin: 'project-health',
			tool: 'project_health',
			model: { provider: 'openai', modelId: 'gpt-5.4', kind: 'openai' },
			usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
			responseBytes: 400,
			costUsd: 0.12,
			tokensSaved: 30,
			durationMs: 40,
			latencyMs: 40,
			outcome: 'success',
			fallbackFrom: null,
			error: null,
			autoBypassed: false,
			requestType: 'query',
			iteration: 1,
		},
		{
			ts: '2026-08-29T09:10:00.000Z',
			sessionId: 's1',
			agent: {
				id: 'delivery-verifier',
				kind: 'orchestrator',
				extension: 'cli',
			},
			plugin: 'usage-tracking',
			tool: 'usage_report',
			model: {
				provider: 'anthropic',
				modelId: 'claude-sonnet-4-6',
				kind: 'anthropic',
			},
			usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
			responseBytes: 320,
			costUsd: null,
			tokensSaved: 0,
			durationMs: 55,
			latencyMs: 55,
			outcome: 'error',
			fallbackFrom: null,
			error: { code: 'schema', message: 'output schema mismatch' },
			autoBypassed: false,
			requestType: 'tool-call',
			iteration: 2,
			errorTelemetry: {
				classification: 'schema-incongruence',
				correlationId: 'corr-1',
				incongruence: true,
				message: 'structured content did not match schema',
			},
			correlation: { id: 'corr-1' },
		},
		{
			ts: '2026-08-29T09:20:00.000Z',
			sessionId: 's2',
			agent: { id: 'falcon', kind: 'delegate', extension: 'cli' },
			plugin: 'proposals',
			tool: 'proposal_review',
			model: null,
			usage: null,
			responseBytes: 280,
			costUsd: null,
			tokensSaved: 0,
			durationMs: 25,
			latencyMs: 25,
			outcome: 'success',
			fallbackFrom: null,
			error: null,
			autoBypassed: true,
			requestType: 'mutation',
			iteration: 1,
		},
	];
	await writeFile(
		join(cacheDirAbs, 'results/usage-tracking/invocations.jsonl'),
		`${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
		'utf8',
	);
	await regenerateSummary(
		join(cacheDirAbs, 'results/usage-tracking/invocations.jsonl'),
		join(cacheDirAbs, 'results/usage-tracking/usage-summary.json'),
		7,
		Date.parse('2026-08-29T12:00:00.000Z'),
	);
	await persistKpiSnapshotHistory({
		workspaceRootAbs: root,
		cacheDir,
		now: new Date('2026-08-28T12:00:00.000Z'),
		snapshot: buildSnapshot({
			generatedAt: '2026-08-28T12:00:00.000Z',
			score: 80,
			calls: 2,
			totalTokens: 90,
			costUsd: 0.2,
			tokenSavings: 25,
		}),
	});
	await persistKpiSnapshotHistory({
		workspaceRootAbs: root,
		cacheDir,
		now: new Date('2026-08-29T12:00:00.000Z'),
		snapshot: buildSnapshot({
			generatedAt: '2026-08-29T12:00:00.000Z',
			score: 84,
			calls: 3,
			totalTokens: 105,
			costUsd: 0.12,
			tokenSavings: 30,
		}),
	});
	return { root, cacheDir };
};

afterEach(async () => {
	vi.restoreAllMocks();
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('project_kpis tool', () => {
	it('returns bounded summary and history views with explicit sources, privacy limits and recommendations', async () => {
		const { root, cacheDir } = await setupWorkspace();

		const result = await runProjectKpis(
			{
				view: 'summary',
				detail: 'compact',
				dimensions: ['plugin'],
				windowDays: 7,
			},
			{
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs: root,
				cacheDir,
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
			},
		);
		const output = ProjectKpisOutputSchema.parse(result.structuredContent);

		expect(output.view).toBe('summary');
		expect(output.snapshot?.highlights.length).toBeGreaterThan(0);
		expect(output.history?.entries.length).toBe(2);
		expect(output.sources.some((source) => source.id === 'snapshot')).toBe(
			true,
		);
		expect(output.privacy.observedMcpOnly).toBe(true);
		expect(output.recommendations.length).toBeGreaterThan(0);
		expect(output.breakdowns?.[0]?.dimension).toBe('plugin');
	});

	it('reads summary, invocations and history when cacheDir is an absolute workspace override', async () => {
		const { root, cacheDir } = await setupWorkspace('absolute');

		const result = await runProjectKpis(
			{
				view: 'summary',
				detail: 'compact',
				dimensions: ['plugin'],
				windowDays: 7,
			},
			{
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs: root,
				cacheDir,
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
			},
		);
		const output = ProjectKpisOutputSchema.parse(result.structuredContent);

		expect(output.snapshot?.highlights.length).toBeGreaterThan(0);
		expect(output.history?.entries.length).toBe(2);
		expect(output.breakdowns?.[0]?.items[0]?.key).toBe('project-health');
		expect(output.snapshot?.highlights).toContainEqual(
			expect.objectContaining({
				key: 'usage.calls',
				source: '@mcp-vertex/usage-tracking/public#buildSummary',
				value: 3,
			}),
		);
	});

	it('supports model and error views with window and dimension filters without inventing missing data', async () => {
		const { root, cacheDir } = await setupWorkspace();

		const modelsResult = await runProjectKpis(
			{
				view: 'models',
				detail: 'compact',
				windowDays: 7,
				filter: { outcome: 'error' },
			},
			{
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs: root,
				cacheDir,
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
			},
		);
		const models = ProjectKpisOutputSchema.parse(
			modelsResult.structuredContent,
		);

		expect(models.view).toBe('models');
		expect(models.breakdowns?.[0]?.items[0]?.key).toContain(
			'anthropic/claude-sonnet-4-6',
		);
		expect(models.breakdowns?.[0]?.items[0]?.calls).toBe(1);

		const errorsResult = await runProjectKpis(
			{
				view: 'errors',
				detail: 'compact',
				dimensions: ['error', 'outcome'],
			},
			{
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs: root,
				cacheDir,
				maxBytes: 12000,
				windowDays: 7,
				now: new Date('2026-08-29T12:00:00.000Z'),
			},
		);
		const errors = ProjectKpisOutputSchema.parse(
			errorsResult.structuredContent,
		);

		expect(errors.view).toBe('errors');
		expect(errors.issues?.items[0]?.classification).toBe(
			'schema-incongruence',
		);
		expect(
			errors.breakdowns?.some(
				(breakdown) => breakdown.dimension === 'error',
			),
		).toBe(true);
	});

	it('exports a registration shape ready for index and assembleCliConfig wiring', async () => {
		const { root, cacheDir } = await setupWorkspace();
		const tool = buildProjectKpisToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: root,
			cacheDir,
			maxBytes: 12000,
			windowDays: 7,
			now: new Date('2026-08-29T12:00:00.000Z'),
		})[0];
		expect(tool?.id).toBe('project_kpis');

		const registerTool = vi.fn();
		const server = { registerTool } as Pick<
			McpServer,
			'registerTool'
		> as McpServer;
		await tool!.register(server);

		const [, meta, handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof ProjectKpisOutputSchema },
			(args: {
				view?: 'audit';
			}) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({ view: 'audit' });
		const output = meta.outputSchema.parse(result.structuredContent);

		expect(output.view).toBe('audit');
		expect(
			output.findings?.items.some(
				(item) => item.id === 'schema-incongruence',
			),
		).toBe(true);
	});
});
