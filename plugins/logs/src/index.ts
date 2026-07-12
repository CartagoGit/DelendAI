import { joinRel, definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { createLogStore } from './lib/services/log-store';
import { normalizeEvent } from './lib/services/normalize-event';
import { buildLogToolRegistrations } from './lib/tools';

export default definePlugin({
	name: 'logs',
	version: '0.1.0',
	describe:
		'Persistent append-only, secret-redacted MCP event log with query, tail, subscribe, correlate and redaction audit tools.',
	optionsSchema: z.object({
		retentionDays: z.number().optional(),
	}),
	async register(ctx) {
		const logsDir = ctx.workspace.resolve(joinRel(ctx.cacheDir, 'logs'));
		const store = createLogStore(logsDir);
		const retentionDays =
			typeof ctx.options.retentionDays === 'number'
				? ctx.options.retentionDays
				: 30;

		// f00072 S4: register log retention as DATA against the shared
		// cache-eviction registry instead of an inline one-shot `gc()`.
		// The `logs/*.jsonl` files are date-named (`YYYY-MM-DD.jsonl`),
		// so the registry's `olderThanDays` strategy reads the date from
		// the filename — same 30-day default, now dry-run aware and run
		// by the boot sweep / `cache_gc` rather than only once at boot.
		// Backward compatible: hosts that DON'T load the `cache` plugin
		// still get the sweep on boot (the core runs the registry once),
		// and a host that wants the old eager behaviour keeps the same
		// retention default.
		ctx.cacheEvictionRegistry?.register({
			id: 'logs-retention',
			owner: 'logs',
			path: 'logs/*',
			when: { kind: 'olderThanDays', days: retentionDays },
		});

		// f00111 S2: one boot marker per server process. Sessions from a
		// stale host and the live one interleave in the same date file;
		// this line is what tells them apart when debugging.
		void (await store).appendEvent(
			normalizeEvent('server-started', {
				taskId: `pid-${process.pid}`,
				pid: process.pid,
				workspace: ctx.workspace.root,
				namespacePrefix: ctx.namespacePrefix,
				summary: `server-started: pid ${process.pid} @ ${ctx.workspace.root}`,
			}),
		);

		return {
			tools: buildLogToolRegistrations(ctx.namespacePrefix, await store),
			knowledge: [
				{
					id: 'logs-operational-event-log',
					title: 'Operational event log',
					body: [
						'# Operational event log',
						'',
						'The logs plugin persists redacted JSONL events under `.cache/mcp-vertex/logs/`.',
						'It captures tool start/completion/failure/cancellation through core hooks and exposes read-only tools for query, tail and correlation.',
						'A `server-started` event marks each host boot (pid + workspace), and `tool-cancelled` records a client-side abort of an in-flight call with its elapsed ms.',
					].join('\n'),
				},
			],
			onToolStart: async (toolName, args) =>
				(await store).appendEvent(
					normalizeEvent('tool-started', {
						toolName,
						taskId: toolName,
						args,
						summary: `tool-started: ${toolName}`,
					}),
				),
			onToolCall: async (toolName, args, result, error) =>
				(await store).appendEvent(
					normalizeEvent(error ? 'tool-failed' : 'tool-completed', {
						toolName,
						taskId: toolName,
						args,
						result,
						error: error instanceof Error ? error.message : error,
						summary: `${error ? 'tool-failed' : 'tool-completed'}: ${toolName}`,
					}),
				),
			// f00111 S2: client aborted the call while the handler was
			// running. The handler's own completion/failure still logs
			// separately when it settles — both lines together tell whether
			// the cancel raced a fast tool or interrupted a slow one.
			onToolCancel: async (toolName, args, elapsedMs) =>
				(await store).appendEvent(
					normalizeEvent('tool-cancelled', {
						toolName,
						taskId: toolName,
						args,
						elapsedMs: Math.round(elapsedMs),
						summary: `tool-cancelled: ${toolName} after ${Math.round(elapsedMs)}ms`,
					}),
				),
		};
	},
});
