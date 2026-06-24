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
		void (await store).gc({
			olderThanDays:
				typeof ctx.options.retentionDays === 'number'
					? ctx.options.retentionDays
					: 30,
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
