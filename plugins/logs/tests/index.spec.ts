import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import type { ICacheEvictionRule } from '@delendai/core/public';
import type { IMcpPluginContext } from '@delendai/core/lib/plugins/plugin-contract';

import logsPlugin from '../src/index';
import { asArray } from '@delendai/test-kit/public';

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
		// Matches the real loader: `joinRel(cacheDir, cacheNamespace + '/' + pluginName)`.
		pluginCacheDir: '.cache/mcp-vertex/results/logs',
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

type ToolHandler = (
	args: Record<string, unknown>,
) => Promise<{ structuredContent: Record<string, unknown> }>;

const registerHandlers = async (
	result: Registrations,
): Promise<Map<string, ToolHandler>> => {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		registerTool: (
			name: string,
			_schema: unknown,
			handler: ToolHandler,
		) => {
			handlers.set(name, handler);
		},
	};
	for (const registration of result.tools ?? []) {
		await registration.register(server as never);
	}
	return handlers;
};

describe('logs plugin — register()', () => {
	it('registers the nine tools plus the operational-log knowledge entry', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		expect((result.tools ?? []).map((t) => t.id).sort()).toEqual([
			'correlate',
			'errors_tail',
			'incidents',
			'log',
			'query',
			'redact_test',
			'search',
			'subscribe',
			'tail',
		]);
		expect(result.knowledge?.[0]?.id).toBe('logs-operational-event-log');
		expect(result.knowledge?.[0]?.body).toContain('logs-errors');
		// f00153 S4 — the new fields and tools are documented in the knowledge body.
		expect(result.knowledge?.[0]?.body).toContain('severity');
		expect(result.knowledge?.[0]?.body).toContain('incidentType');
		expect(result.knowledge?.[0]?.body).toContain('logs_log');
		expect(result.knowledge?.[0]?.body).toContain('logs_search');
		expect(result.knowledge?.[0]?.body).toContain('logs_incidents');
	});

	it('injects a ctx.logs helper that peer plugins can call (f00153 S4)', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		const logs = (
			ctx as { logs?: { log: (input: unknown) => Promise<void> } }
		).logs;
		expect(logs).toBeDefined();
		await logs?.log({
			severity: 'critical',
			incidentType: 'lock-conflict',
			message: 'agents/proposals.lock held > 30s',
			files: ['agents/proposals.lock'],
			agent: 'peer-agent',
			context: { hint: 'unit-test' },
		});
		const handlers = await registerHandlers(result);
		const query = await handlers.get('logs_query')?.({
			incidentType: 'lock-conflict',
			detail: 'full',
		});
		const events = query?.structuredContent.events as Array<{
			incidentType: string | null;
			severity: string;
			agent: string | null;
			meta: { source?: string; hint?: string };
		}>;
		const found = events.find((e) => e.meta.source === 'ctx.logs');
		expect(found?.incidentType).toBe('lock-conflict');
		expect(found?.severity).toBe('critical');
		expect(found?.agent).toBe('peer-agent');
		expect(found?.meta.hint).toBe('unit-test');
	});

	it('registers independent keepLastN retention rules for results/logs/* and results/logs-errors/*, default 10', async () => {
		const { ctx, rules } = await buildCtx();
		await logsPlugin.register(ctx);
		expect(rules).toEqual([
			{
				id: 'logs-retention',
				owner: 'logs',
				path: 'results/logs/*',
				when: { kind: 'keepLastN', n: 10 },
			},
			{
				id: 'logs-errors-retention',
				owner: 'logs',
				path: 'results/logs-errors/*',
				when: { kind: 'keepLastN', n: 10 },
			},
		]);
	});

	it('honors a configured retentionCount', async () => {
		const { ctx, rules } = await buildCtx({ retentionCount: 3 });
		await logsPlugin.register(ctx);
		expect(rules.map((r) => (r.when as { n: number }).n)).toEqual([3, 3]);
	});

	it('routes a failed tool call into BOTH streams while redacting public diagnostics', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		const args = { agent: 'copilot-a1', path: 'plugins/logs/src/index.ts' };
		await result.onToolStart?.('x_broken', args);
		await result.onToolCall?.(
			'x_broken',
			args,
			{ isError: true },
			new Error('boom'),
			123.4,
		);

		const handlers = await registerHandlers(result);
		const tail = await handlers.get('logs_tail')?.({ includeMeta: true });
		const tailEvents = tail?.structuredContent.events as Array<{
			kind: string;
			taskId: string;
			agent: string | null;
			files: string[];
			summary: string;
			meta: {
				elapsedMs?: number;
				error?: { message?: string; stack?: string };
				callId?: string;
			};
		}>;
		const started = tailEvents.find(
			(e) => e.taskId === 'x_broken' && e.kind === 'tool-started',
		);
		const failed = tailEvents.find(
			(e) => e.taskId === 'x_broken' && e.kind === 'tool-failed',
		);
		expect(failed?.meta.elapsedMs).toBe(123);
		expect(failed?.meta.error).toEqual({
			redacted: true,
			fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
			hasStack: true,
		});
		expect(failed?.agent).toBe('copilot-a1');
		expect(failed?.files).toEqual(['plugins/logs/src/index.ts']);
		expect(failed?.summary).toBe('tool-failed: x_broken (123ms)');
		expect(typeof failed?.meta.callId).toBe('string');
		expect(failed?.meta.callId).toBe(started?.meta.callId);
		expect(JSON.stringify(failed)).not.toContain('boom');

		const errors = await handlers.get('logs_errors_tail')?.({});
		const errorEvents = errors?.structuredContent.events as Array<{
			taskId: string;
		}>;
		expect(errorEvents.map((e) => e.taskId)).toEqual(['x_broken']);
	});

	it('does NOT route a successful tool call into the error stream, and its summary carries elapsedMs', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		await result.onToolCall?.(
			'x_ok',
			{ a: 1 },
			{ isError: false },
			undefined,
			10,
		);

		const handlers = await registerHandlers(result);
		const errors = await handlers.get('logs_errors_tail')?.({});
		const errorEvents = asArray(errors?.structuredContent.events);
		expect(
			errorEvents.some(
				(e) => (e as { taskId: string }).taskId === 'x_ok',
			),
		).toBe(false);

		const tail = await handlers.get('logs_tail')?.({ includeMeta: true });
		const tailEvents = tail?.structuredContent.events as Array<{
			taskId: string;
			summary: string;
		}>;
		expect(tailEvents.find((e) => e.taskId === 'x_ok')?.summary).toBe(
			'tool-completed: x_ok (10ms)',
		);
	});

	it('pairs concurrent calls to the SAME tool via callId, not just taskId', async () => {
		const { ctx } = await buildCtx();
		const result: Registrations = await logsPlugin.register(ctx);
		// Two distinct in-flight invocations of the same tool — distinct
		// args object identity is exactly what core hands each hook call.
		const argsA = { agent: 'agent-a' };
		const argsB = { agent: 'agent-b' };
		await result.onToolStart?.('x_same', argsA);
		await result.onToolStart?.('x_same', argsB);
		// B finishes first, then A — out-of-order settlement is the whole
		// point of the test.
		await result.onToolCall?.(
			'x_same',
			argsB,
			{ isError: false },
			undefined,
			5,
		);
		await result.onToolCall?.(
			'x_same',
			argsA,
			{ isError: false },
			undefined,
			7,
		);

		const handlers = await registerHandlers(result);
		const tail = await handlers.get('logs_tail')?.({
			includeMeta: true,
			limit: 10,
		});
		const events = tail?.structuredContent.events as Array<{
			kind: string;
			agent: string | null;
			meta: { callId?: string };
		}>;
		const startedA = events.find(
			(e) => e.kind === 'tool-started' && e.agent === 'agent-a',
		);
		const startedB = events.find(
			(e) => e.kind === 'tool-started' && e.agent === 'agent-b',
		);
		const completedA = events.find(
			(e) => e.kind === 'tool-completed' && e.agent === 'agent-a',
		);
		const completedB = events.find(
			(e) => e.kind === 'tool-completed' && e.agent === 'agent-b',
		);
		expect(startedA?.meta.callId).toBeTruthy();
		expect(startedB?.meta.callId).toBeTruthy();
		expect(startedA?.meta.callId).not.toBe(startedB?.meta.callId);
		expect(completedA?.meta.callId).toBe(startedA?.meta.callId);
		expect(completedB?.meta.callId).toBe(startedB?.meta.callId);
	});
});
