import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import type { ICacheEvictionRule } from '@mcp-vertex/core/public';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';

import logsPlugin from '../src/index';

type Registrations = Awaited<ReturnType<typeof logsPlugin.register>>;

const buildCtx = async (
	options: Record<string, unknown> = {},
): Promise<{ ctx: IMcpPluginContext; rules: ICacheEvictionRule[] }> => {
	const root = await mkdtemp(join(tmpdir(), 'mcp-vertex-logs-plugin-'));
	const rules: ICacheEvictionRule[] = [];
	const ctx: IMcpPluginContext = {
		workspace: { root, resolve: (p: string) => join(root, p) },
		corePaths: {
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
		},
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		keepLegacy: false,
		pluginCacheDir: '.cache/mcp-vertex/logs',
		pluginDocsDir: 'docs/mcp-vertex/logs',
		namespacePrefix: 'logs',
		options,
		args: {},
		cacheEvictionRegistry: {
			register: (rule) => {
				rules.push(rule);
			},
			unregister: () => false,
			list: () => rules,
			run: async () => ({
				dryRun: true,
				appliedAt: new Date().toISOString(),
				totalBytes: 0,
				removed: [],
				skipped: [],
				errors: [],
				rulesEvaluated: rules.length,
			}),
		},
	};
	return { ctx, rules };
};

describe('logs plugin — register()', () => {
	it('registers the six tools plus the operational-log knowledge entry', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		expect((result.tools ?? []).map((t) => t.id).sort()).toEqual([
			'correlate',
			'errors_tail',
			'query',
			'redact_test',
			'subscribe',
			'tail',
		]);
		expect(result.knowledge?.[0]?.id).toBe('logs-operational-event-log');
		expect(result.knowledge?.[0]?.body).toContain('logs-errors');
	});

	it('registers independent keepLastN retention rules for logs/* and logs-errors/*, default 10', async () => {
		const { ctx, rules } = await buildCtx();
		await logsPlugin.register(ctx);
		expect(rules).toEqual([
			{
				id: 'logs-retention',
				owner: 'logs',
				path: 'logs/*',
				when: { kind: 'keepLastN', n: 10 },
			},
			{
				id: 'logs-errors-retention',
				owner: 'logs',
				path: 'logs-errors/*',
				when: { kind: 'keepLastN', n: 10 },
			},
		]);
	});

	it('honors a configured retentionCount', async () => {
		const { ctx, rules } = await buildCtx({ retentionCount: 3 });
		await logsPlugin.register(ctx);
		expect(rules.map((r) => (r.when as { n: number }).n)).toEqual([3, 3]);
	});

	it('routes a failed tool call into BOTH the main and error streams', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		await result.onToolCall?.(
			'x_broken',
			{ a: 1 },
			{ isError: true },
			new Error('boom'),
			123.4,
		);

		const handlers = new Map<
			string,
			(args: Record<string, unknown>) => Promise<{
				structuredContent: Record<string, unknown>;
			}>
		>();
		const server = {
			registerTool: (
				name: string,
				_schema: unknown,
				handler: (
					args: Record<string, unknown>,
				) => Promise<{ structuredContent: Record<string, unknown> }>,
			) => {
				handlers.set(name, handler);
			},
		};
		for (const registration of result.tools ?? []) {
			await registration.register(server as never);
		}

		const tail = await handlers.get('logs_tail')?.({ includeMeta: true });
		const tailEvents = tail?.structuredContent.events as Array<{
			taskId: string;
			meta: { elapsedMs?: number; error?: { message?: string } };
		}>;
		const failed = tailEvents.find((e) => e.taskId === 'x_broken');
		expect(failed?.meta.elapsedMs).toBe(123);
		expect(failed?.meta.error?.message).toBe('boom');

		const errors = await handlers.get('logs_errors_tail')?.({});
		const errorEvents = errors?.structuredContent.events as Array<{
			taskId: string;
		}>;
		expect(errorEvents.map((e) => e.taskId)).toEqual(['x_broken']);
	});

	it('does NOT route a successful tool call into the error stream', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		await result.onToolCall?.(
			'x_ok',
			{ a: 1 },
			{ isError: false },
			undefined,
			10,
		);

		const handlers = new Map<
			string,
			(args: Record<string, unknown>) => Promise<{
				structuredContent: Record<string, unknown>;
			}>
		>();
		const server = {
			registerTool: (
				name: string,
				_schema: unknown,
				handler: (
					args: Record<string, unknown>,
				) => Promise<{ structuredContent: Record<string, unknown> }>,
			) => {
				handlers.set(name, handler);
			},
		};
		for (const registration of result.tools ?? []) {
			await registration.register(server as never);
		}

		const errors = await handlers.get('logs_errors_tail')?.({});
		const errorEvents = errors?.structuredContent.events as unknown[];
		expect(
			errorEvents.some(
				(e) => (e as { taskId: string }).taskId === 'x_ok',
			),
		).toBe(false);
	});
});
