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
						'It captures tool start/completion/failure through core hooks and exposes read-only tools for query, tail and correlation.',
						'Editor-side chat cancellation is not visible unless the client sends a server-side cancellation signal.',
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
		};
	},
});
