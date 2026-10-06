/**
 * error-sink-adapter.spec.ts — f00251 S3 (integration tests).
 *
 * Boots the full logs plugin against a real tmp directory to verify that
 * an `ICapturedError` recorded through the core collector fan-out lands in
 * BOTH the main JSONL stream and the curated error stream, and that the
 * `BufferingErrorSink` receives the same event.
 */

import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
	BufferingErrorSink,
	createErrorCollector,
	type ICapturedError,
} from '@delendai/core/public';
import type { ICacheEvictionRule } from '@delendai/core/public';
import type { IMcpPluginContext } from '@delendai/core/lib/plugins/plugin-contract';

import logsPlugin from '../../../../src/index';
import { createLogStore } from '../../../../src/lib/services/log-store';

// ---------------------------------------------------------------------------
// Context builder (mirrors the one in tests/index.spec.ts)
// ---------------------------------------------------------------------------

const buildCtx = async (): Promise<{
	ctx: IMcpPluginContext;
	root: string;
}> => {
	const root = await mkdtemp(join(tmpdir(), 'logs-error-sink-adapter-'));
	const rules: ICacheEvictionRule[] = [];
	const ctx: IMcpPluginContext = {
		workspace: { root, resolve: (p: string) => join(root, p) },
		corePaths: {
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
		},
		cacheDir: '.cache/delendai',
		docsDir: 'docs/delendai',
		keepLegacy: false,
		pluginCacheDir: '.cache/delendai/results/logs',
		pluginDocsDir: 'docs/delendai/logs',
		namespacePrefix: 'logs',
		options: {},
		args: {},
		cacheEvictionRegistry: {
			register: (rule) => rules.push(rule),
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
	return { ctx, root };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logs plugin error-sink adapter — integration (f00251 S3)', () => {
	it('register() exposes exactly one errorSink with id "logs-error"', async () => {
		const { ctx } = await buildCtx();
		const registrations = await logsPlugin.register(ctx);

		expect(registrations.errorSinks).toHaveLength(1);
		expect(registrations.errorSinks![0]!.id).toBe('logs-error');
	});

	it('fan-out: error recorded through collector lands in main + error JSONL streams and BufferingErrorSink', async () => {
		const { ctx, root } = await buildCtx();
		const registrations = await logsPlugin.register(ctx);

		const logsSink = registrations.errorSinks![0]!;
		const buffer = new BufferingErrorSink();
		const collector = createErrorCollector({
			sinks: [logsSink, buffer],
		});

		const captured: ICapturedError = await collector.record(
			new Error('boom — integration test'),
			{
				toolName: 'logs_query',
				packageId: 'test-pkg',
				pluginName: 'logs',
			},
		);

		// BufferingErrorSink received the event.
		expect(buffer.events).toHaveLength(1);
		expect(buffer.events[0]!.fingerprint).toBe(captured.fingerprint);

		// Main JSONL stream has the incident-error line.
		const logsDir = join(root, '.cache/delendai/results/logs');
		const mainStore = await createLogStore(logsDir);
		const mainEvents = await mainStore.tail({ limit: 10 });
		const errorLine = mainEvents.find(
			(e) => e.incidentType === 'logs_query' && e.outcome === 'failed',
		);
		expect(errorLine).toBeDefined();
		expect(errorLine!.kind).toBe('log-warning');
		expect(errorLine!.meta.sink).toBe('logs-error');

		// Curated error JSONL stream also has the same line.
		const errorLogsDir = join(root, '.cache/delendai/results/logs-errors');
		const errorStore = await createLogStore(errorLogsDir);
		const errorEvents = await errorStore.tail({ limit: 10 });
		const sameInErrorStream = errorEvents.find(
			(e) =>
				typeof e.meta.fingerprint === 'string' &&
				e.meta.fingerprint === captured.fingerprint,
		);
		expect(sameInErrorStream).toBeDefined();
	});

	it('summary does not expose the raw error message token when redaction applies', async () => {
		const { ctx } = await buildCtx();
		const registrations = await logsPlugin.register(ctx);
		const logsSink = registrations.errorSinks![0]!;
		const buffer = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [logsSink, buffer] });

		// Embed an API-key pattern that redactSecrets recognises.
		const secret = 'sk-proj-abc123secrettoken';
		await collector.record(new Error(`API_KEY=${secret}`), {
			toolName: 'logs_tail',
			packageId: 'test-pkg',
			pluginName: 'logs',
		});

		// The collector pre-redacts; the adapter re-applies redactSecrets.
		expect(buffer.events[0]!.summary).not.toContain(secret);
	});
});
