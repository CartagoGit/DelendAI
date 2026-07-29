import z from 'zod';

import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import type { ILogToolStores } from '../contracts/interfaces/tools.interface';
import { correlateEvents } from '../services/correlate';
import {
	incidentTypeForKind,
	INCIDENT_TYPE_PATTERN,
	isValidIncidentType,
	KIND_TO_INCIDENT_TYPE,
	LOG_SEVERITIES,
	severityForOutcome,
} from '../services/kinds';
import { logIncidents, logSearch } from '../services/log-search-incidents';
import { LOG_OUTCOMES, type LogEventKind } from '../services/normalize-event';
import type { ILogEvent } from '../services/normalize-event';
import type { LogOutcome } from '../services/normalize-event';
import { redactTest } from '../services/redact-test';

export type { ILogToolStores } from '../contracts/interfaces/tools.interface';

const LogOutcomeSchema = z.enum(LOG_OUTCOMES);
const LogSeveritySchema = z.enum(LOG_SEVERITIES);
const LogEventSchema = z.object({
	ts: z.string(),
	kind: z.string(),
	agent: z.string().nullable(),
	taskId: z.string().nullable(),
	outcome: LogOutcomeSchema,
	severity: LogSeveritySchema,
	incidentType: z.string().nullable(),
	files: z.array(z.string()),
	summary: z.string(),
	meta: z.record(z.string(), z.unknown()),
});

const QueryInputSchema = z.object({
	since: z.string().optional(),
	until: z.string().optional(),
	kind: z.string().optional(),
	agent: z.string().optional(),
	taskId: z.string().optional(),
	outcome: LogOutcomeSchema.optional(),
	severity: LogSeveritySchema.optional(),
	incidentType: z.string().optional(),
	limit: z.number().optional(),
	cursor: z.string().optional(),
});

const parseCursor = (cursor: string | undefined): number => {
	if (!cursor) return 0;
	const decoded = Number.parseInt(
		Buffer.from(cursor, 'base64url').toString('utf8'),
		10,
	);
	return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
};

const makeCursor = (offset: number): string =>
	Buffer.from(String(offset), 'utf8').toString('base64url');

const queryFilterFrom = (
	args: z.infer<typeof QueryInputSchema>,
): {
	since?: string;
	until?: string;
	kind?: LogEventKind;
	agent?: string;
	taskId?: string;
	outcome?: LogOutcome;
	severityAtLeast?: import('../services/kinds').LogSeverity;
	incidentType?: string;
} => ({
	...(args.since !== undefined ? { since: args.since } : {}),
	...(args.until !== undefined ? { until: args.until } : {}),
	...(args.kind !== undefined ? { kind: args.kind as LogEventKind } : {}),
	...(args.agent !== undefined ? { agent: args.agent } : {}),
	...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
	...(args.outcome !== undefined ? { outcome: args.outcome } : {}),
	...(args.severity !== undefined ? { severityAtLeast: args.severity } : {}),
	...(args.incidentType !== undefined
		? { incidentType: args.incidentType }
		: {}),
});

const tailOptionsFrom = (args: {
	limit?: number | undefined;
	outcomeFilter?: LogOutcome | undefined;
	kindFilter?: string | undefined;
}): {
	limit?: number;
	outcomeFilter?: LogOutcome;
	kindFilter?: LogEventKind;
} => ({
	...(args.limit !== undefined ? { limit: args.limit } : {}),
	...(args.outcomeFilter !== undefined
		? { outcomeFilter: args.outcomeFilter }
		: {}),
	...(args.kindFilter !== undefined
		? { kindFilter: args.kindFilter as LogEventKind }
		: {}),
});

const compactEvents = (
	events: readonly ILogEvent[],
	includeMeta: boolean | undefined,
): readonly ILogEvent[] =>
	includeMeta === true
		? events
		: events.map((event) => ({
				...event,
				meta: {},
			}));

const correlateOptionsFrom = (args: {
	taskId?: string | undefined;
	agent?: string | undefined;
	since?: string | undefined;
	until?: string | undefined;
}): {
	taskId?: string;
	agent?: string;
	since?: string;
	until?: string;
} => ({
	...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
	...(args.agent !== undefined ? { agent: args.agent } : {}),
	...(args.since !== undefined ? { since: args.since } : {}),
	...(args.until !== undefined ? { until: args.until } : {}),
});

export const buildLogToolRegistrations = (
	prefix: string,
	stores: ILogToolStores,
): readonly IToolRegistration[] => {
	const store = stores.main;
	return [
		{
			id: 'query',
			summary:
				'Query redacted append-only MCP log events with filters and cursor pagination.',
			tags: ['logs', 'observability'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_query`,
					{
						description:
							'Query redacted append-only MCP log events. Filters: since, until, kind, agent, taskId, outcome; supports cursor pagination.',
						inputSchema: QueryInputSchema,
						outputSchema: z.object({
							events: z.array(LogEventSchema),
							cursor: z.string().nullable(),
							hasMore: z.boolean(),
						}),
					},
					async (args: z.infer<typeof QueryInputSchema>) => {
						const limit = Math.max(
							1,
							Math.min(args.limit ?? 100, 1000),
						);
						const offset = parseCursor(args.cursor);
						const events = await store.readRange(
							queryFilterFrom(args),
						);
						const page = events.slice(offset, offset + limit);
						const nextOffset = offset + page.length;
						const hasMore = nextOffset < events.length;
						return toolJson({
							events: page,
							cursor: hasMore ? makeCursor(nextOffset) : null,
							hasMore,
						});
					},
				);
			},
		},
		{
			id: 'tail',
			summary: 'Return the newest redacted MCP log events.',
			tags: ['logs', 'observability'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_tail`,
					{
						description:
							'Return the newest redacted MCP log events, optionally filtered by outcome or kind. Omits verbose meta by default; pass includeMeta:true for the full stored event.',
						inputSchema: z.object({
							limit: z.number().optional(),
							outcomeFilter: LogOutcomeSchema.optional(),
							kindFilter: z.string().optional(),
							includeMeta: z.boolean().optional(),
						}),
						outputSchema: z.object({
							events: z.array(LogEventSchema),
							oldestTs: z.string().nullable(),
							newestTs: z.string().nullable(),
						}),
					},
					async (args: {
						limit?: number | undefined;
						outcomeFilter?: LogOutcome | undefined;
						kindFilter?: string | undefined;
						includeMeta?: boolean | undefined;
					}) => {
						const events = compactEvents(
							await store.tail(tailOptionsFrom(args)),
							args.includeMeta,
						);
						return toolJson({
							events,
							oldestTs: events[0]?.ts ?? null,
							newestTs: events.at(-1)?.ts ?? null,
						});
					},
				);
			},
		},
		{
			id: 'errors_tail',
			summary:
				'Return the newest curated error/anomaly events — start here when auditing or debugging.',
			tags: ['logs', 'observability', 'audit'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_errors_tail`,
					{
						description:
							'Return the newest events from the curated error stream (outcome not ok/idle: failed, timed-out, dead, cancelled, unknown). Each entry carries full context by default (args, result, error message+stack, elapsedMs) — pass includeMeta:false to omit it. Read this BEFORE reading source when auditing or debugging: it points at exactly where execution did not reach the expected state.',
						inputSchema: z.object({
							limit: z.number().optional(),
							kindFilter: z.string().optional(),
							includeMeta: z.boolean().optional(),
						}),
						outputSchema: z.object({
							events: z.array(LogEventSchema),
							oldestTs: z.string().nullable(),
							newestTs: z.string().nullable(),
						}),
					},
					async (args: {
						limit?: number | undefined;
						kindFilter?: string | undefined;
						includeMeta?: boolean | undefined;
					}) => {
						const events = compactEvents(
							await stores.errors.tail(
								tailOptionsFrom({
									limit: args.limit,
									kindFilter: args.kindFilter,
								}),
							),
							args.includeMeta ?? true,
						);
						return toolJson({
							events,
							oldestTs: events[0]?.ts ?? null,
							newestTs: events.at(-1)?.ts ?? null,
						});
					},
				);
			},
		},
		{
			id: 'subscribe',
			summary:
				'Return recent events in the shape consumed by the logs SSE endpoint.',
			tags: ['logs', 'observability'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_subscribe`,
					{
						description:
							'Return recent redacted log events matching optional outcome/kind filters. Web SSE endpoints poll this read-only tool.',
						inputSchema: z.object({
							outcomeFilter: LogOutcomeSchema.optional(),
							kindFilter: z.string().optional(),
							limit: z.number().optional(),
						}),
						outputSchema: z.object({
							events: z.array(LogEventSchema),
							stream: z.literal('logs'),
						}),
					},
					async (args: {
						outcomeFilter?: LogOutcome | undefined;
						kindFilter?: string | undefined;
						limit?: number | undefined;
					}) =>
						toolJson({
							stream: 'logs' as const,
							events: await store.tail(
								tailOptionsFrom({
									...args,
									limit: args.limit ?? 50,
								}),
							),
						}),
				);
			},
		},
		{
			id: 'correlate',
			summary:
				'Build a timeline for one taskId or agent and flag long gaps.',
			tags: ['logs', 'observability'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_correlate`,
					{
						description:
							'Build a chronological chain for exactly one taskId or agent and return gap detection.',
						inputSchema: z.object({
							taskId: z.string().optional(),
							agent: z.string().optional(),
							since: z.string().optional(),
							until: z.string().optional(),
						}),
						// x00107: SUCCESS shape only — the SDK skips schema
						// validation for `isError` results (`toolError`), so
						// the strict required fields are correct. (x00105
						// briefly loosened this; reverted.)
						outputSchema: z.object({
							chain: z.array(LogEventSchema),
							firstTs: z.string().nullable(),
							lastTs: z.string().nullable(),
							gaps: z.array(
								z.object({
									startTs: z.string(),
									endTs: z.string(),
									durationMs: z.number(),
								}),
							),
						}),
					},
					async (args: {
						taskId?: string | undefined;
						agent?: string | undefined;
						since?: string | undefined;
						until?: string | undefined;
					}) => {
						try {
							return toolJson(
								await correlateEvents(
									store,
									correlateOptionsFrom(args),
								),
							);
						} catch (error) {
							return toolError(
								'Invalid correlation request',
								error instanceof Error
									? error.message
									: String(error),
							);
						}
					},
				);
			},
		},
		{
			id: 'redact_test',
			summary:
				'Audit how the shared secret redactor treats a sample payload.',
			tags: ['logs', 'security'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_redact_test`,
					{
						description:
							'Run the shared redactor against a sample payload and list detected high-confidence secret pattern names.',
						inputSchema: z.object({ text: z.string() }),
						outputSchema: z.object({
							detected: z.array(z.string()),
							redacted: z.string(),
						}),
					},
					async (args: { text: string }) =>
						toolJson(redactTest(args.text)),
				);
			},
		},
		{
			// f00153 S2 — write-side. Closes the symmetry gap: any
			// plugin, host or MCP agent can now record an incident
			// without writing JSONL directly. `severity` defaults to
			// `warning` when omitted so a sloppy caller still gets a
			// useful event in the log.
			id: 'log',
			summary:
				'Record a structured incident (severity + incidentType + message) into the redacted event log.',
			tags: ['logs', 'observability', 'incident'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_log`,
					{
						description:
							'Record a structured incident into the redacted event log. `incidentType` must be a lower-case slug in `^[a-z][a-z0-9-]{0,63}$`. The new event lands in the main timeline (not the curated error stream) with `severity`, `incidentType` and the caller-supplied `message` so it is filterable by `query`/`search`/`incidents`.',
						inputSchema: z.object({
							severity: LogSeveritySchema.default('warning'),
							incidentType: z
								.string()
								.regex(INCIDENT_TYPE_PATTERN),
							message: z.string().min(1),
							files: z.array(z.string()).optional(),
							agent: z.string().optional(),
							context: z
								.record(z.string(), z.unknown())
								.optional(),
						}),
						outputSchema: z.object({
							ok: z.literal(true),
							ts: z.string(),
							incidentType: z.string(),
							severity: LogSeveritySchema,
						}),
					},
					async (args: {
						severity: import('../services/kinds').LogSeverity;
						incidentType: string;
						message: string;
						files?: string[] | undefined;
						agent?: string | undefined;
						context?: Record<string, unknown> | undefined;
					}) => {
						if (!isValidIncidentType(args.incidentType)) {
							return toolError(
								`invalid incidentType "${args.incidentType}"`,
								`must match ${INCIDENT_TYPE_PATTERN}`,
							);
						}
						const ts = new Date().toISOString();
						const outcome = severityToOutcome(args.severity);
						const summary = `incident-logged: ${args.incidentType} \u2014 ${args.message.slice(0, 140)}`;
						const event: ILogEvent = {
							ts,
							kind: 'log-warning',
							agent: args.agent ?? null,
							taskId: args.incidentType,
							outcome,
							severity: args.severity,
							incidentType: args.incidentType,
							files: args.files ?? [],
							summary,
							meta: {
								source: 'logs_log',
								...(args.context ?? {}),
							},
						};
						await store.appendEvent(event);
						return toolJson({
							ok: true as const,
							ts,
							incidentType: args.incidentType,
							severity: args.severity,
						});
					},
				);
			},
		},
		{
			// f00153 S2 — content search. `query` only filters on
			// metadata; `search` looks inside `summary`, `error.message`,
			// `error.stack`, `args` and `result`.
			id: 'search',
			summary:
				'Full-text / regex search over event summary, error message+stack, args and result.',
			tags: ['logs', 'observability'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_search`,
					{
						description:
							'Search the redacted event log. `pattern` is a substring by default; pass `isRegex:true` for a JavaScript regular expression. `scope` narrows the surface (`summary` | `error` | `args` | `result` | `all`; default `all`). Returns the matched events with `matched` count and `hasMore` pagination.',
						inputSchema: z.object({
							pattern: z.string().min(1),
							caseSensitive: z.boolean().optional(),
							isRegex: z.boolean().optional(),
							scope: z
								.enum([
									'summary',
									'error',
									'args',
									'result',
									'all',
								])
								.optional(),
							limit: z.number().optional(),
							since: z.string().optional(),
							until: z.string().optional(),
						}),
						outputSchema: z.object({
							events: z.array(LogEventSchema),
							matched: z.number(),
							hasMore: z.boolean(),
						}),
					},
					async (args: {
						pattern: string;
						caseSensitive?: boolean | undefined;
						isRegex?: boolean | undefined;
						scope?:
							| 'summary'
							| 'error'
							| 'args'
							| 'result'
							| 'all'
							| undefined;
						limit?: number | undefined;
						since?: string | undefined;
						until?: string | undefined;
					}) => {
						try {
							// f00153 S2: search both streams in parallel so a
							// string appearing in either the main timeline or
							// the curated error stream is found. Dedupe by
							// ts+summary+kind — the same event is mirrored in
							// both streams with the same identity, so a single
							// dedupe key is enough.
							const [mainResult, errResult] = await Promise.all([
								logSearch(store, args),
								logSearch(stores.errors, args),
							]);
							const seen = new Set<string>();
							const events: ILogEvent[] = [];
							for (const e of [
								...mainResult.events,
								...errResult.events,
							]) {
								const key = `${e.ts}|${e.summary}|${e.kind}`;
								if (seen.has(key)) continue;
								seen.add(key);
								events.push(e);
							}
							const limit = Math.max(
								1,
								Math.min(args.limit ?? 100, 1000),
							);
							const page = events.slice(0, limit);
							return toolJson({
								events: page,
								matched: events.length,
								hasMore: events.length > page.length,
							});
						} catch (error) {
							return toolError(
								'Search failed',
								error instanceof Error
									? error.message
									: String(error),
							);
						}
					},
				);
			},
		},
		{
			// f00153 S3 — auto-detector. Reads the curated error stream
			// (NOT the main timeline) and clusters failing events by
			// `(toolName, hash(error.message))` so recurring incidents
			// surface as one record with a count.
			id: 'incidents',
			summary:
				'Cluster recurring failing events by (toolName, error.message) so the same bug surfaces once with a count.',
			tags: ['logs', 'observability', 'audit', 'incident'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_incidents`,
					{
						description:
							'Read the curated error stream and group failing events by (toolName, error.message hash). Each cluster carries `count`, `distinctAgents`, `firstSeen`, `lastSeen`, `sampleSummary`, `sampleError` and the most recent `recentEvents`. Clusters with fewer than `minCount` (default 2) matches are dropped. Use this for the "what is broken right now" question \u2014 it returns the same bug many times, ONCE.',
						inputSchema: z.object({
							since: z.string().optional(),
							until: z.string().optional(),
							minCount: z.number().optional(),
							agent: z.string().optional(),
							recentLimit: z.number().optional(),
						}),
						outputSchema: z.object({
							incidents: z.array(
								z.object({
									incidentType: z.string(),
									toolName: z.string(),
									count: z.number(),
									distinctAgents: z.number(),
									firstSeen: z.string(),
									lastSeen: z.string(),
									sampleSummary: z.string(),
									sampleError: z.string(),
									recentEvents: z.array(LogEventSchema),
								}),
							),
							totalIncidents: z.number(),
						}),
					},
					async (args: {
						since?: string | undefined;
						until?: string | undefined;
						minCount?: number | undefined;
						agent?: string | undefined;
						recentLimit?: number | undefined;
					}) => {
						const result = await logIncidents(stores.errors, args);
						return toolJson(result);
					},
				);
			},
		},
	];
};

/**
 * f00153 S2 — derive an `outcome` from a `severity` so a written
 * incident lands in the curated error stream when it is actually an
 * error (severity `error` and above) but does NOT pollute the
 * errors-tail when it is a `warning` / `notice` / `info`. Symmetric
 * with `severityForOutcome`, but in reverse.
 */
const severityToOutcome = (
	severity: import('../services/kinds').LogSeverity,
): LogOutcome => {
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
