/**
 * plugin.spec.ts — end-to-end register() + observability hooks.
 *
 * Drives the plugin exactly as the host does: build a context, call
 * `register()`, then fire `onToolStart` / `onToolCall` and assert a
 * durable record lands in `invocations.jsonl` with the right attribution
 * and agent — the observability integration (no new host contract).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@mcp-vertex/core/public';

import plugin from '../../../src/index';
import type { IInvocationRecord } from '../../../src/lib/types';

const readLog = (path: string): IInvocationRecord[] =>
	readFileSync(path, 'utf8')
		.split('\n')
		.filter((l) => l.trim() !== '')
		.map((l) => JSON.parse(l) as IInvocationRecord);

describe('usage-tracking plugin (register + hooks)', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-plugin-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const makeCtx = (): IMcpPluginContext =>
		({
			workspace: { root: dir, resolve: (p: string) => join(dir, p) },
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: 'usage-tracking',
			pluginDocsDir: 'docs/usage-tracking',
			namespacePrefix: 'mcp-vertex_usage-tracking',
			hostIdentity: { host: 'Claude Code' },
			peerPlugins: {
				list: () => ['proposals', 'usage-tracking'],
				has: (n: string) => ['proposals', 'usage-tracking'].includes(n),
			},
			options: { maxBatch: 2, maxDelayMs: 20 },
			args: {},
		}) as unknown as IMcpPluginContext;

	it('registers the two tools + knowledge + both hooks', async () => {
		const reg = await plugin.register(makeCtx());
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'usage_report',
			'usage_clear',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('usage-tracking-usage');
		expect(typeof reg.onToolStart).toBe('function');
		expect(typeof reg.onToolCall).toBe('function');
	});

	it('records a paired start+call as a durable, attributed record', async () => {
		const reg = await plugin.register(makeCtx());
		reg.onToolStart?.('mcp-vertex_proposals_auto_work', {});
		reg.onToolCall?.(
			'mcp-vertex_proposals_auto_work',
			{ sessionId: 's_call' },
			{ ok: true },
			undefined,
		);
		// maxBatch:2 not reached (1 record) → wait for the 20ms window flush.
		await new Promise((r) => setTimeout(r, 80));

		const logPath = join(dir, 'usage-tracking', 'invocations.jsonl');
		const rows = readLog(logPath);
		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		expect(row.plugin).toBe('proposals');
		expect(row.tool).toBe('auto_work');
		expect(row.agent.kind).toBe('claude-code');
		expect(row.agent.extension).toBe('claude-code');
		expect(row.sessionId).toBe('s_call');
		expect(row.outcome).toBe('success');
		expect(typeof row.durationMs).toBe('number');
	});

	it('records an error outcome when the hook carries an error', async () => {
		const reg = await plugin.register(makeCtx());
		reg.onToolStart?.('mcp-vertex_docs_docs_read', {});
		reg.onToolCall?.(
			'mcp-vertex_docs_docs_read',
			{},
			undefined,
			new Error('nope'),
		);
		await new Promise((r) => setTimeout(r, 80));
		const rows = readLog(join(dir, 'usage-tracking', 'invocations.jsonl'));
		expect(rows[0]?.outcome).toBe('error');
		expect(rows[0]?.error?.message).toBe('nope');
	});
});
