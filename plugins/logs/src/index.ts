import { joinRel, definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { createLogStore } from './lib/services/log-store';
import {
	isErrorOutcome,
	normalizeEvent,
	type ILogEvent,
} from './lib/services/normalize-event';
import { buildLogToolRegistrations } from './lib/tools';

// Error-stream lines are rarer and higher-value than the noisy main
// timeline (they exist specifically to hold a full stack trace and
// call context) — worth a bigger per-line budget before truncation
// kicks in.
const ERROR_STORE_MAX_LINE_BYTES = 32 * 1024;

export default definePlugin({
	name: 'logs',
	version: '0.1.0',
	describe:
		'Persistent append-only, secret-redacted MCP event log with query, tail, subscribe, correlate, curated error-stream and redaction audit tools.',
	// The log is an accumulated record, not derivable cache — deleting it
	// loses real history. See IMcpPlugin#cacheNamespace.
	cacheNamespace: 'results',
	optionsSchema: z.object({
		retentionCount: z.number().optional(),
	}),
	async register(ctx) {
		const logsDir = ctx.workspace.resolve(joinRel(ctx.cacheDir, 'logs'));
		const errorLogsDir = ctx.workspace.resolve(
			joinRel(ctx.cacheDir, 'logs-errors'),
		);
		const [mainStore, errorStore] = await Promise.all([
			createLogStore(logsDir),
			createLogStore(errorLogsDir, {
				maxLineBytes: ERROR_STORE_MAX_LINE_BYTES,
			}),
		]);
		const retentionCount =
			typeof ctx.options.retentionCount === 'number'
				? ctx.options.retentionCount
				: 10;

		// Every event lands in the main timeline (`logs/*.jsonl`); any
		// event whose outcome didn't cleanly reach `ok`/`idle` ALSO lands
		// in the curated error stream (`logs-errors/*.jsonl`) with full
		// context (elapsedMs, error message + stack, args). The error
		// stream is what an audit reads first to know where to look
		// before opening a single source file — see the
		// `mcp-vertex-audit-playbook` skill's pre-flight step.
		const appendEvent = async (event: ILogEvent): Promise<void> => {
			await mainStore.appendEvent(event);
			if (isErrorOutcome(event.outcome)) {
				await errorStore.appendEvent(event);
			}
		};

		// f00072 S4 / rotation rework: register retention as DATA against
		// the shared cache-eviction registry instead of an inline
		// one-shot `gc()`. Both streams keep the newest N *files*
		// (`keepLastN`, one file per day) rather than aging out by
		// calendar date — a slow week doesn't lose last month's only
		// failure, and a busy week doesn't keep 30 days of noise. Each
		// stream is retained independently so a burst of errors can't
		// starve the main timeline's retention window or vice versa.
		ctx.cacheEvictionRegistry?.register({
			id: 'logs-retention',
			owner: 'logs',
			path: 'logs/*',
			when: { kind: 'keepLastN', n: retentionCount },
		});
		ctx.cacheEvictionRegistry?.register({
			id: 'logs-errors-retention',
			owner: 'logs',
			path: 'logs-errors/*',
			when: { kind: 'keepLastN', n: retentionCount },
		});

		// f00111 S2: one boot marker per server process. Sessions from a
		// stale host and the live one interleave in the same date file;
		// this line is what tells them apart when debugging.
		await appendEvent(
			normalizeEvent('server-started', {
				taskId: `pid-${process.pid}`,
				pid: process.pid,
				workspace: ctx.workspace.root,
				namespacePrefix: ctx.namespacePrefix,
				summary: `server-started: pid ${process.pid} @ ${ctx.workspace.root}`,
			}),
		);

		return {
			tools: buildLogToolRegistrations(ctx.namespacePrefix, {
				main: mainStore,
				errors: errorStore,
			}),
			knowledge: [
				{
					id: 'logs-operational-event-log',
					title: 'Operational event log',
					body: [
						'# Operational event log',
						'',
						'The logs plugin persists redacted JSONL events under `.cache/mcp-vertex/results/logs/` (every event) and ALSO under `.cache/mcp-vertex/results/logs-errors/` (only events whose outcome is not `ok`/`idle` — failed, timed-out, dead, cancelled or unknown).',
						'It captures tool start/completion/failure/cancellation through core hooks, including `elapsedMs` for every completed/failed call (not just cancellations) and the error `.stack` when available.',
						'Both streams are day-rotated JSONL, each retained independently to the newest `retentionCount` files (default 10, oldest dropped first) — history from earlier sessions survives as long as it fits that window.',
						'A `server-started` event marks each host boot (pid + workspace).',
						'`<prefix>_errors_tail` is the fast path for "where do I look for bugs": it reads ONLY the curated error stream, with full `meta` (args/result/error/stack) included by default.',
					].join('\n'),
				},
			],
			onToolStart: async (toolName, args) =>
				appendEvent(
					normalizeEvent('tool-started', {
						toolName,
						taskId: toolName,
						args,
						summary: `tool-started: ${toolName}`,
					}),
				),
			onToolCall: async (toolName, args, result, error, elapsedMs) =>
				appendEvent(
					normalizeEvent(error ? 'tool-failed' : 'tool-completed', {
						toolName,
						taskId: toolName,
						args,
						result,
						error:
							error instanceof Error
								? { message: error.message, stack: error.stack }
								: error,
						elapsedMs:
							typeof elapsedMs === 'number'
								? Math.round(elapsedMs)
								: undefined,
						summary: `${error ? 'tool-failed' : 'tool-completed'}: ${toolName}`,
					}),
				),
			// f00111 S2: client aborted the call while the handler was
			// running. The handler's own completion/failure still logs
			// separately when it settles — both lines together tell whether
			// the cancel raced a fast tool or interrupted a slow one.
			onToolCancel: async (toolName, args, elapsedMs) =>
				appendEvent(
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
