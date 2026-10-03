import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildOperationalEventLogKnowledge } from './lib/knowledge/logs-knowledge';
import { buildErrorCollectorKnowledge } from './lib/knowledge/error-collector';
import type { LogSeverity } from './lib/services/kinds';
import { createLogStore } from './lib/services/log-store';
import { createLogsErrorSinkAdapter } from './lib/services/error-sink-adapter';
import {
	extractAgentHint,
	extractFilesHint,
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

/** WeakMap requires an object key; a primitive/undefined args value
 *  (rare — schema-less tools) just means no call-id correlation. */
const asCorrelationKey = (value: unknown): object | null =>
	typeof value === 'object' && value !== null ? value : null;

const errorMessageOf = (error: unknown): string | undefined => {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return undefined;
};

export default definePlugin({
	name: 'logs',
	version: '0.1.1',
	describe:
		'Persistent append-only, secret-redacted MCP event log with query, tail, subscribe, correlate, curated error-stream and redaction audit tools.',
	// The log is an accumulated record, not derivable cache — deleting it
	// loses real history. See IMcpPlugin#cacheNamespace.
	cacheNamespace: 'results',
	optionsSchema: z.object({
		retentionCount: z.number().optional(),
	}),
	async register(ctx) {
		// `ctx.pluginCacheDir` (NOT `ctx.cacheDir`) already resolves to
		// `results/logs` because of `cacheNamespace: 'results'` above —
		// `ctx.cacheDir` is the raw, un-namespaced cache root, and using
		// it directly here would silently write outside `results/`,
		// where `check-stray-cache-files` and any tooling that treats
		// `results/` as accumulated (non-derivable) records wouldn't
		// recognize the log history as durable.
		const logsDir = ctx.workspace.resolve(ctx.pluginCacheDir);
		const errorLogsDir = ctx.workspace.resolve(
			join(dirname(ctx.pluginCacheDir), 'logs-errors'),
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

		// Pairs a `tool-started` line with its eventual `tool-completed`/
		// `tool-failed`/`tool-cancelled` line via a per-invocation id.
		// Without this, two concurrent calls to the SAME tool (routine in
		// a multi-agent swarm) are indistinguishable in the log — both
		// share the identical `taskId` (the tool name), so there is no
		// way to tell which start belongs to which outcome. Keyed by the
		// args object identity, which core hands to every hook for one
		// invocation unchanged (confirmed against `create-mcp-project.ts`'s
		// `wrap()`), so concurrent calls to the same tool never collide.
		const inFlightCallIds = new WeakMap<object, string>();

		// Every event lands in the main timeline (`logs/*.jsonl`); any
		// event whose outcome didn't cleanly reach `ok`/`idle` ALSO lands
		// in the curated error stream (`logs-errors/*.jsonl`) with full
		// context (elapsedMs, error message + stack, args). The error
		// stream is what an audit reads first to know where to look
		// before opening a single source file — see the
		// `delendai-audit-playbook` skill's pre-flight step.
		const appendEvent = async (event: ILogEvent): Promise<void> => {
			await mainStore.appendEvent(event);
			if (isErrorOutcome(event.outcome)) {
				await errorStore.appendEvent(event);
			}
		};

		// S3 — adapter that forwards ICapturedError events from
		// the core collector into the same JSONL streams used by the
		// lifecycle hooks. Instantiated here so it shares the
		// `appendEvent` closure and inherits both-stream fan-out for free.
		const adapter = createLogsErrorSinkAdapter({ appendEvent });

		// S4 / rotation rework: register retention as DATA against
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
			// Eviction rule paths are relative to the raw cacheDir root
			// (NOT pluginCacheDir), so the `results/` namespace segment
			// must be spelled out here to match where the store actually
			// writes.
			path: 'results/logs/*',
			when: { kind: 'keepLastN', n: retentionCount },
		});
		ctx.cacheEvictionRegistry?.register({
			id: 'logs-errors-retention',
			owner: 'logs',
			path: 'results/logs-errors/*',
			when: { kind: 'keepLastN', n: retentionCount },
		});

		// S2: one boot marker per server process. Sessions from a
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

		// S4 — cross-plugin incident helper. The `logs` plugin
		// owns the `appendEvent` writer, but peer plugins (notification,
		// quality, security, …) can call it through `ctx.logs.log(...)`
		// without depending on `@delendai/logs` at compile time. The
		// `IMcpPluginContext.logs` field is optional in the contract;
		// when this plugin is present it injects the helper. The cast
		// through the readonly `IMcpPluginContext` is the only place we
		// mutate the context after the core hands it in, and it is safe
		// because the cast is internal to this plugin and the property
		// is added (not replaced) on an object the loader has not yet
		// handed to anyone else.
		const logsHelper: {
			readonly log: (input: {
				readonly severity: LogSeverity;
				readonly incidentType: string;
				readonly message: string;
				readonly files?: readonly string[] | undefined;
				readonly agent?: string | undefined;
				readonly context?:
					| Readonly<Record<string, unknown>>
					| undefined;
			}) => Promise<void>;
		} = {
			log: async (input) => {
				const ts = new Date().toISOString();
				const outcome = severityToOutcomeForHelper(input.severity);
				const event: ILogEvent = {
					ts,
					kind: 'log-warning',
					agent: input.agent ?? null,
					taskId: input.incidentType,
					outcome,
					severity: input.severity,
					incidentType: input.incidentType,
					files: input.files ?? [],
					summary: `incident-logged: ${input.incidentType} \u2014 ${input.message.slice(0, 140)}`,
					meta: {
						source: 'ctx.logs',
						...(input.context ?? {}),
					},
				};
				await appendEvent(event);
			},
		};
		// The core's `IMcpPluginContext` declares `logs?` (optional) but
		// the property is structurally readonly; assign through a type-
		// asserted `Omit<>` of the readonly modifier so the cast is
		// confined to this one statement and the runtime mutation is
		// safe (the loader has not yet handed `ctx` to another plugin).
		(ctx as { logs?: typeof logsHelper }).logs = logsHelper;

		return {
			tools: buildLogToolRegistrations(ctx.namespacePrefix, {
				main: mainStore,
				errors: errorStore,
			}),
			// f00251 S3 — expose the adapter so the assembler registers
			// it with the core error collector. Shares `appendEvent`
			// and inherits the error-stream fan-out for free.
			errorSinks: [adapter.sink],
			// S2 — publish our appendEvent as the canonical
			// sink. The core routes every `onToolStart` / `onToolCall`
			// / `onToolCancel` (across ALL plugins) through this sink,
			// so the JSONL streams are populated even for plugins that
			// ship no `onTool*` hooks of their own.
			logsSink: {
				id: 'logs-plugin',
				record: async (event) => {
					await appendEvent(
						normalizeEvent(event.kind as never, {
							ts: event.ts,
							toolName: event.toolName ?? undefined,
							taskId: event.taskId ?? undefined,
							agent: event.agent,
							summary: event.summary,
							meta: event.meta,
						}),
					);
				},
			},
			knowledge: [
				{
					id: 'logs-operational-event-log',
					title: 'Operational event log',
					body: buildOperationalEventLogKnowledge({
						prefix: ctx.namespacePrefix,
					}),
				},
				{
					id: 'logs-error-collector',
					title: 'Error-collector sink adapter (f00251)',
					body: buildErrorCollectorKnowledge({
						prefix: ctx.namespacePrefix,
					}),
				},
			],
			onToolStart: async (toolName, args) => {
				const callId = randomUUID();
				const key = asCorrelationKey(args);
				if (key) inFlightCallIds.set(key, callId);
				return appendEvent(
					normalizeEvent('tool-started', {
						toolName,
						taskId: toolName,
						callId,
						agent: extractAgentHint(args),
						files: extractFilesHint(args, undefined),
						args,
						summary: `tool-started: ${toolName}`,
					}),
				);
			},
			onToolCall: async (toolName, args, result, error, elapsedMs) => {
				const key = asCorrelationKey(args);
				const callId = key ? inFlightCallIds.get(key) : undefined;
				if (key) inFlightCallIds.delete(key);
				const roundedElapsed =
					typeof elapsedMs === 'number'
						? Math.round(elapsedMs)
						: undefined;
				const durationSuffix =
					roundedElapsed !== undefined
						? ` (${roundedElapsed}ms)`
						: '';
				const message = errorMessageOf(error);
				const summary = error
					? `tool-failed: ${toolName}${message ? ` — ${message}` : ''}${durationSuffix}`
					: `tool-completed: ${toolName}${durationSuffix}`;
				return appendEvent(
					normalizeEvent(error ? 'tool-failed' : 'tool-completed', {
						toolName,
						taskId: toolName,
						callId,
						agent: extractAgentHint(args),
						files: extractFilesHint(args, result),
						args,
						result,
						error:
							error instanceof Error
								? { message: error.message, stack: error.stack }
								: error,
						elapsedMs: roundedElapsed,
						summary,
					}),
				);
			},
			// S2: client aborted the call while the handler was
			// running. The handler's own completion/failure still logs
			// separately when it settles — both lines together tell whether
			// the cancel raced a fast tool or interrupted a slow one. Does
			// NOT clear `inFlightCallIds`: the completion/failure still
			// needs the same `callId` when it settles later.
			onToolCancel: async (toolName, args, elapsedMs, context) => {
				const key = asCorrelationKey(args);
				const callId = key ? inFlightCallIds.get(key) : undefined;
				return appendEvent(
					normalizeEvent('tool-cancelled', {
						toolName,
						taskId: toolName,
						callId,
						agent: extractAgentHint(args),
						files: extractFilesHint(args, undefined),
						args,
						elapsedMs: Math.round(elapsedMs),
						summary: `tool-cancelled: ${toolName} after ${Math.round(elapsedMs)}ms: ${context?.reason ?? 'tool invocation aborted'}`,
						meta: {
							cancellationReason:
								context?.reason ?? 'tool invocation aborted',
							cancellationNextAction:
								context?.nextAction ??
								'Retry the operation or resume from the latest persisted checkpoint.',
							cancellationError: context?.error,
						},
					}),
				);
			},
		};
	},
});

/**
 * f00153 S4 — derive an `outcome` for a peer-emitted incident. The
 * outcome drives which stream the event lands in (the curated error
 * stream lights up when `outcome !== 'ok' && outcome !== 'idle'`),
 * so an `error`/`critical`/`alert`/`emergency` severity promotes the
 * event to the error stream and a `warning`/`notice`/`info` keeps
 * it on the main timeline only.
 */
const severityToOutcomeForHelper = (
	severity: LogSeverity,
): import('./lib/services/normalize-event').LogOutcome => {
	if (
		severity === 'error' ||
		severity === 'critical' ||
		severity === 'alert' ||
		severity === 'emergency'
	) {
		return 'failed';
	}
	if (severity === 'warning') return 'unknown';
	if (severity === 'notice') return 'cancelled';
	return 'ok';
};
