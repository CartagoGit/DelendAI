/**
 * End-to-end smoke pass for `@mcp-vertex/project-kpis` (f00282 S8).
 *
 * Exercises the plugin exactly as a host would: loads the plugin through
 * `definePlugin`, seeds a real persisted KPI history under a temporary
 * workspace, registers the `project_kpis` tool through the same
 * registration path used by `assembleCliConfig`, and asserts that the
 * tool returns a bounded, schema-valid, privacy-safe output — including
 * honest `unavailable`/`not-configured` statuses instead of invented
 * zeros. No prompts, response bodies, credentials or secrets are ever
 * written or returned.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import projectKpisPlugin from '../src/index';
import type {
	IKpiMetric,
	IKpiSnapshot,
	TKpiValueStatus,
} from '../src/lib/contracts/kpi-snapshot.interface';
import { persistKpiSnapshotHistory } from '../src/lib/services/kpi-history.service';
import { buildProjectKpisToolRegistrations } from '../src/lib/tools/project-kpis.tool';
import type { ProjectKpisOutputSchema } from '../src/lib/tools/project-kpis.tool';

const CACHE_DIR = '.cache/mcp-vertex';
const createdRoots: string[] = [];

const metric = (
	status: TKpiValueStatus,
	unit: IKpiMetric['unit'],
	source: string,
	value?: number,
): IKpiMetric => ({
	status,
	unit,
	source,
	...(value !== undefined ? { value } : {}),
	observedAt: '2026-08-29T12:00:00.000Z',
});

const buildSnapshot = (generatedAt: string, score: number): IKpiSnapshot => ({
	contract: 'project-kpis.snapshot',
	version: 1,
	generatedAt,
	windowDays: 7,
	health: {
		status: 'estimated',
		source: 'test/health',
		score: metric('estimated', 'score', 'test/health', score),
		security: metric('estimated', 'score', 'test/health', 80),
		deps: metric('estimated', 'score', 'test/health', 90),
		quality: metric('estimated', 'score', 'test/health', 88),
		debt: metric('estimated', 'score', 'test/health', 70),
		next: [],
	},
	usage: {
		status: 'measured',
		source: 'test/usage',
		calls: metric('measured', 'count', 'test/usage', 12),
		errors: metric('measured', 'count', 'test/usage', 1),
		toolErrorRate: metric('measured', 'ratio', 'test/usage', 1 / 12),
		totalTokens: metric('measured', 'tokens', 'test/usage', 2048),
		costUsd: metric('measured', 'usd', 'test/usage', 0.5),
		tokensSaved: metric('measured', 'tokens', 'test/usage', 256),
		memoryCompactionSavingsTokens: metric(
			'unavailable',
			'tokens',
			'test/usage',
		),
		topPlugins: [],
	},
	delivery: {
		status: 'measured',
		source: 'test/delivery',
		note: 'delivery snapshot',
	},
	bytes: 2048,
	truncated: false,
});

const setupWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'project-kpis-e2e-'));
	createdRoots.push(root);
	await persistKpiSnapshotHistory({
		workspaceRootAbs: root,
		cacheDir: CACHE_DIR,
		snapshot: buildSnapshot('2026-08-28T12:00:00.000Z', 80),
		now: new Date('2026-08-28T12:00:00.000Z'),
	});
	await persistKpiSnapshotHistory({
		workspaceRootAbs: root,
		cacheDir: CACHE_DIR,
		snapshot: buildSnapshot('2026-08-29T12:00:00.000Z', 82),
		now: new Date('2026-08-29T12:00:00.000Z'),
	});
	return root;
};

afterEach(async () => {
	await Promise.all(
		createdRoots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe('project-kpis end-to-end smoke', () => {
	it('loads through definePlugin and exposes the plugin registration contract', async () => {
		expect(projectKpisPlugin.name).toBe('project-kpis');
		expect(typeof projectKpisPlugin.register).toBe('function');
		expect(projectKpisPlugin.version).toBe('0.1.0');
	});

	it('registers project_kpis over the assembled tool path and returns a bounded schema-valid view', async () => {
		const root = await setupWorkspace();
		const tool = buildProjectKpisToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: root,
			cacheDir: CACHE_DIR,
			maxBytes: 12000,
			windowDays: 7,
			now: new Date('2026-08-29T12:00:00.000Z'),
		})[0];
		expect(tool?.id).toBe('project_kpis');

		const registerTool = vi.fn();
		const server = {
			registerTool,
		} as Pick<McpServer, 'registerTool'> as McpServer;
		await tool!.register(server);

		const [, meta, handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof ProjectKpisOutputSchema },
			(args: { view?: string }) => Promise<{
				structuredContent?: unknown;
			}>,
		];
		const result = await handler({ view: 'summary' });
		const output = meta.outputSchema.parse(result.structuredContent);

		expect(output.contract).toBe('project-kpis.view');
		expect(output.view).toBe('summary');
		expect(output.bytes).toBeGreaterThan(0);
		expect(output.truncated).toBe(false);
		expect(output.privacy.observedMcpOnly).toBe(true);
		expect(output.privacy.limitations.length).toBeGreaterThan(0);
		expect(output.sources.length).toBeGreaterThan(0);
		expect(output.history?.entries.length).toBe(2);
	});

	it('surfaces honest unavailable statuses when no invocation telemetry exists', async () => {
		const root = await setupWorkspace();
		const tool = buildProjectKpisToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: root,
			cacheDir: CACHE_DIR,
			maxBytes: 12000,
			windowDays: 7,
			now: new Date('2026-08-29T12:00:00.000Z'),
		})[0];

		const registerTool = vi.fn();
		const server = {
			registerTool,
		} as Pick<McpServer, 'registerTool'> as McpServer;
		await tool!.register(server);
		const [, meta, handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof ProjectKpisOutputSchema },
			(args: { view?: string }) => Promise<{
				structuredContent?: unknown;
			}>,
		];
		const result = await handler({ view: 'usage' });
		const output = meta.outputSchema.parse(result.structuredContent);

		// No usage telemetry file exists in this workspace, so the view must
		// say so explicitly rather than reporting misleading zeros.
		const invocations = output.sources.find(
			(source) => source.id === 'invocations',
		);
		expect(invocations?.status).toBe('not-configured');
		expect(output.privacy.limitations.length).toBeGreaterThan(0);
	});

	it('does not leak secret material into the rendered output', async () => {
		const root = await setupWorkspace();
		await writeFile(
			join(root, '.cache', 'mcp-vertex', 'token.txt'),
			'super-secret-token-value',
			'utf8',
		);
		const tool = buildProjectKpisToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: root,
			cacheDir: CACHE_DIR,
			maxBytes: 12000,
			windowDays: 7,
			now: new Date('2026-08-29T12:00:00.000Z'),
		})[0];

		const registerTool = vi.fn();
		const server = {
			registerTool,
		} as Pick<McpServer, 'registerTool'> as McpServer;
		await tool!.register(server);
		const [, , handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof ProjectKpisOutputSchema },
			(args: { view?: string }) => Promise<{
				structuredContent?: unknown;
			}>,
		];
		const result = await handler({ view: 'summary' });
		const serialized = JSON.stringify(result.structuredContent);
		expect(serialized).not.toContain('super-secret-token-value');
	});
});
