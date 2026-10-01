import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import usageTrackingPlugin from '../src/index';
import {
	readSessionSurfaceBytes,
	SessionSurfaceBytesService,
	sumSessionSurfaceBytes,
} from '../src/lib/session-surface-bytes.service';

const readRecordsEventually = async (
	filePath: string,
	count: number,
): Promise<Awaited<ReturnType<typeof readSessionSurfaceBytes>>> => {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		const records = await readSessionSurfaceBytes(filePath);
		if (records.length >= count) return records;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return readSessionSurfaceBytes(filePath);
};

describe('session-surface-bytes service', () => {
	let dir = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'session-surface-bytes-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('persists NDJSON rows and aggregates served bytes by session', async () => {
		const filePath = join(dir, 'session-surface-bytes.jsonl');
		const service = new SessionSurfaceBytesService(filePath, {
			maxBatch: 1,
			maxDelayMs: 1,
		});

		service.record({
			sessionId: 's-1',
			servedBytes: 120,
			tools: 3,
			at: 10,
		});
		service.record({ sessionId: 's-1', servedBytes: 80, tools: 2, at: 20 });
		service.record({ sessionId: 's-2', servedBytes: 25, tools: 1, at: 30 });
		await service.close();

		const records = await readSessionSurfaceBytes(filePath);
		expect(records.map((record) => record.sessionId)).toEqual([
			's-1',
			's-1',
			's-2',
		]);
		expect(sumSessionSurfaceBytes(records)).toEqual({
			's-1': 200,
			's-2': 25,
		});
	});
});

describe('usage-tracking tools/list served bytes', () => {
	let workspace = '';
	let surfaceBytesPath = '';

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'usage-tracking-surface-'));
		surfaceBytesPath = join(
			workspace,
			'results/usage-tracking/session-surface-bytes.jsonl',
		);
	});

	afterEach(async () => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it('records one tools/list row per served response and accumulates bytes per session', async () => {
		const server = new McpServer({ name: 'test', version: '0.0.0' });
		server.registerTool(
			'alpha',
			{ description: 'alpha tool' },
			async () => ({ content: [{ type: 'text', text: 'alpha' }] }),
		);

		const registrations = await usageTrackingPlugin.register({
			workspace: {
				root: workspace,
				resolve: (relativePath: string) =>
					join(workspace, relativePath),
			},
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
			},
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			keepLegacy: false,
			pluginCacheDir: 'results/usage-tracking',
			cachePath: (relativePath = '') =>
				join(workspace, 'results/usage-tracking', relativePath),
			pluginDocsDir: 'docs/delendai/usage-tracking',
			namespacePrefix: 'delendai_usage-tracking',
			options: { maxBatch: 1, maxDelayMs: 10 },
			args: {},
		} as Parameters<typeof usageTrackingPlugin.register>[0]);
		expect(
			registrations.tools?.map((registration) => registration.id),
		).toEqual(['usage_report', 'usage_clear', 'session_hygiene']);

		// Re-read the live handler Map on every call: `registerTool`
		// rebuilds the consolidated `tools/list` handler, so a
		// reference captured earlier would go stale. `_requestHandlers`
		// is private to the SDK, so we read it through a structural
		// shape via a public helper to avoid unsafe casts.
		interface IToolsListHandlerMap {
			_requestHandlers?: Map<
				string,
				(
					request: unknown,
					extra: { sessionId?: string },
				) => Promise<{ tools: unknown[] }>
			>;
		}
		const asHandlerMap = (value: object): IToolsListHandlerMap => {
			const candidate = value as { [key: string]: unknown };
			const handlers = candidate._requestHandlers;
			if (handlers instanceof Map) {
				return { _requestHandlers: handlers };
			}
			return {};
		};
		const getRequestHandlers = (): IToolsListHandlerMap =>
			asHandlerMap(server.server as object);
		const listTools = (
			request: unknown,
			extra: { sessionId?: string },
		): Promise<{ tools: unknown[] }> | undefined =>
			getRequestHandlers()._requestHandlers?.get('tools/list')?.(
				request,
				extra,
			);

		// The observer is installed when the plugin's own tool is
		// registered, so the first observable snapshot already
		// includes alpha + usage_report.
		await registrations.tools?.[0]?.register(server);
		const initial = await listTools(
			{ method: 'tools/list', params: {} },
			{ sessionId: 'session-1' },
		);
		expect(initial?.tools).toHaveLength(2);

		server.registerTool('beta', { description: 'beta tool' }, async () => ({
			content: [{ type: 'text', text: 'beta' }],
		}));
		const afterRegister = await listTools(
			{ method: 'tools/list', params: {} },
			{ sessionId: 'session-1' },
		);
		expect(afterRegister?.tools).toHaveLength(3);

		const records = await readRecordsEventually(surfaceBytesPath, 2);
		expect(records).toHaveLength(2);
		expect(records[0]?.sessionId).toBe(records[1]?.sessionId);
		expect(records[1]?.servedBytes).toBeGreaterThan(
			records[0]?.servedBytes ?? 0,
		);
		expect(
			sumSessionSurfaceBytes(records)[records[0]!.sessionId] ?? 0,
		).toBe((records[0]?.servedBytes ?? 0) + (records[1]?.servedBytes ?? 0));

		const raw = readFileSync(surfaceBytesPath, 'utf8');
		expect(raw.trim().split('\n')).toHaveLength(2);
	});
});
