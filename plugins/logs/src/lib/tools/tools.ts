import { createHash } from 'node:crypto';

import z from 'zod';

import {
	DETAIL_LEVELS,
	projectDetail,
	toolError,
	toolJson,
	toolJsonWithSummary,
	type Detail,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import type { ILogToolStores } from '../contracts/interfaces/tools.interface';
import { correlateEvents } from '../services/correlate';
import {
	INCIDENT_TYPE_PATTERN,
	isValidIncidentType,
	LOG_SEVERITIES,
} from '../services/kinds';
import { logIncidents, logSearch } from '../services/log-search-incidents';
import { LOG_OUTCOMES, type LogEventKind } from '../services/normalize-event';
import type { ILogEvent } from '../services/normalize-event';
import type { LogOutcome } from '../services/normalize-event';
import { redactTest } from '../services/redact-test';

export type { ILogToolStores } from '../contracts/interfaces/tools.interface';

const LogOutcomeSchema = z.enum(LOG_OUTCOMES);
const LogSeveritySchema = z.enum(LOG_SEVERITIES);
const DetailSchema = z.enum(DETAIL_LEVELS);
const LogEventListOutputSchema = z.array(z.unknown());
const DECIMAL_RADIX = 10;
const SUBSCRIBE_DEFAULT_LIMIT = 50;
const INCIDENT_TYPE_MAX_LENGTH = 63;
const INCIDENT_TYPE_PATTERN_DOC = `^[a-z][a-z0-9-]{0,${INCIDENT_TYPE_MAX_LENGTH}}$`;
const INCIDENT_SUMMARY_PREVIEW_CHARS = 140;

const sha1 = (input: string): string =>
	createHash('sha1').update(input).digest('hex').slice(0, 16);
const _LogEventSchema = z.object({
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
		DECIMAL_RADIX,
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
	detail: Detail,
): readonly unknown[] => events.map((event) => projectLogEvent(event, detail));

const readErrorText = (value: unknown): string | null => {
	if (typeof value === 'string' && value.length > 0) return value;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (typeof record.message === 'string' && record.message.length > 0) {
			return record.message;
		}
	}
	return null;
};

const hasErrorStack = (value: unknown): boolean => {
	if (!value || typeof value !== 'object') return false;
	const stack = (value as Record<string, unknown>).stack;
	return typeof stack === 'string' && stack.length > 0;
};

const publicErrorFingerprint = (event: ILogEvent): string | null => {
	const errorText = readErrorText(event.meta.error);
	if (errorText === null) return null;
	const toolName =
		typeof event.meta.toolName === 'string' &&
		event.meta.toolName.length > 0
			? event.meta.toolName
			: (event.taskId ?? event.kind);
	return sha1(`${toolName}|${errorText}`);
};

const publicSummary = (event: ILogEvent): string => {
	if (readErrorText(event.meta.error) === null) return event.summary;
	const separator = event.summary.indexOf(' — ');
	const baseSummary =
		separator >= 0 ? event.summary.slice(0, separator) : event.summary;
	const elapsedMs = event.meta.elapsedMs;
	if (
		typeof elapsedMs === 'number' &&
		Number.isFinite(elapsedMs) &&
		baseSummary.includes('ms') === false
	) {
		return `${baseSummary} (${Math.round(elapsedMs)}ms)`;
	}
	return baseSummary;
};

const sanitizeSummaryText = (summary: string): string => {
	const separator = summary.indexOf(' — ');
	return separator >= 0 ? summary.slice(0, separator) : summary;
};

const publicMeta = (event: ILogEvent): Record<string, unknown> => {
	const meta = { ...event.meta };
	if (typeof meta.summary === 'string') {
		meta.summary = publicSummary(event);
	}
	if (readErrorText(meta.error) === null) return meta;
	meta.error = {
		redacted: true,
		fingerprint: publicErrorFingerprint(event),
		hasStack: hasErrorStack(event.meta.error),
	};
	return meta;
};

const projectLogEventCompact = (
	event: ILogEvent,
): Pick<
	ILogEvent,
	'ts' | 'kind' | 'outcome' | 'severity' | 'incidentType' | 'summary'
> => ({
	ts: event.ts,
	kind: event.kind,
	outcome: event.outcome,
	severity: event.severity,
	incidentType: event.incidentType,
	summary: publicSummary(event),
});

const projectLogEventNormal = (
	event: ILogEvent,
): Omit<ILogEvent, 'meta'> & { meta: Record<string, never> } => ({
	...event,
	summary: publicSummary(event),
	meta: {},
});

const projectLogEvent = (event: ILogEvent, detail: Detail): unknown =>
	projectDetail(
		event,
		{
			compact: projectLogEventCompact,
			normal: projectLogEventNormal,
			full: (full) => ({
				...full,
				summary: publicSummary(full),
				meta: publicMeta(full),
			}),
		},
		detail,
	);

const publicIncident = (
	incident: Awaited<ReturnType<typeof logIncidents>>['incidents'][number],
) => ({
	incidentType: incident.incidentType,
	toolName: incident.toolName,
	errorFingerprint: incident.errorFingerprint,
	hasStack: incident.hasStack,
	count: incident.count,
	distinctAgents: incident.distinctAgents,
	firstSeen: incident.firstSeen,
	lastSeen: incident.lastSeen,
	sampleSummary:
		(incident.recentEvents.at(-1) ?? incident.recentEvents[0])
			? publicSummary(
					incident.recentEvents.at(-1) ?? incident.recentEvents[0]!,
				)
			: sanitizeSummaryText(incident.sampleSummary),
	recentEvents: compactEvents(incident.recentEvents, 'full'),
});

const resolveEventDetail = (args: {
	detail?: Detail | undefined;
	includeMeta?: boolean | undefined;
}): Detail => args.detail ?? (args.includeMeta === true ? 'full' : 'normal');

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
							'Query redacted append-only MCP log events. Filters: since, until, kind, agent, taskId, outcome; supports cursor pagination. `detail` defaults to `normal` (stored event with empty meta), `compact` keeps only the incident summary envelope, and `full` returns the stored event unchanged.',
						inputSchema: QueryInputSchema.extend({
							detail: DetailSchema.optional(),
						}),
						outputSchema: z.object({
							detail: DetailSchema,
							events: LogEventListOutputSchema,
							cursor: z.string().nullable(),
							hasMore: z.boolean(),
						}),
					},
					async (
						args: z.infer<typeof QueryInputSchema> & {
							detail?: Detail | undefined;
						},
					) => {
						const limit = Math.max(
							1,
							Math.min(args.limit ?? 100, 1000),
						);
						const offset = parseCursor(args.cursor);
						const detail = resolveEventDetail(args);
						const events = await store.readRange(
							queryFilterFrom(args),
						);
						const page = events.slice(offset, offset + limit);
						const nextOffset = offset + page.length;
						const hasMore = nextOffset < events.length;
						return toolJson({
							detail,
							events: compactEvents(page, detail),
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
							'Return the newest redacted MCP log events, optionally filtered by outcome or kind. `detail` defaults to `normal` (stored event with empty meta), `compact` keeps only the incident summary envelope, and `full` returns the stored event unchanged. Legacy `includeMeta:true` remains supported and resolves to `detail: full` when `detail` is omitted.',
						inputSchema: z.object({
							limit: z.number().optional(),
							outcomeFilter: LogOutcomeSchema.optional(),
							kindFilter: z.string().optional(),
							detail: DetailSchema.optional(),
							includeMeta: z.boolean().optional(),
						}),
						outputSchema: z.object({
							detail: DetailSchema,
							events: LogEventListOutputSchema,
							oldestTs: z.string().nullable(),
							newestTs: z.string().nullable(),
						}),
					},
					async (args: {
						limit?: number | undefined;
						outcomeFilter?: LogOutcome | undefined;
						kindFilter?: string | undefined;
						detail?: Detail | undefined;
						includeMeta?: boolean | undefined;
					}) => {
						const detail = resolveEventDetail(args);
						const storedEvents = await store.tail(
							tailOptionsFrom(args),
						);
						const events = compactEvents(storedEvents, detail);
						const oldestTs = storedEvents[0]?.ts ?? null;
						const newestTs = storedEvents.at(-1)?.ts ?? null;
						// v00132 (AUD-F06): `content[0].text` used to
						// duplicate `structuredContent` byte-for-byte —
						// verified no in-process caller in this repo reads
						// `logs_tail`'s `content[0].text` (only
						// `structuredContent`, see plugins/logs/tests/
						// tools.spec.ts's `structured()` helper). Emit a
						// compact summary instead; `structuredContent`
						// carries the full payload unchanged.
						return toolJsonWithSummary(
							{
								detail,
								events,
								oldestTs,
								newestTs,
							},
							`${events.length} log lines, newest at ${newestTs ?? 'n/a'}`,
						);
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
							'Return the newest events from the curated error stream (outcome not ok/idle: failed, timed-out, dead, cancelled, unknown). `detail` defaults to `normal` (stored event with empty meta), `compact` keeps only the incident summary envelope, and `full` returns the stored event unchanged. Legacy `includeMeta:true` remains supported and resolves to `detail: full` when `detail` is omitted. Read this BEFORE reading source when auditing or debugging: it points at exactly where execution did not reach the expected state.',
						inputSchema: z.object({
							limit: z.number().optional(),
							kindFilter: z.string().optional(),
							detail: DetailSchema.optional(),
							includeMeta: z.boolean().optional(),
						}),
						outputSchema: z.object({
							detail: DetailSchema,
							events: LogEventListOutputSchema,
							oldestTs: z.string().nullable(),
							newestTs: z.string().nullable(),
						}),
					},
					async (args: {
						limit?: number | undefined;
						kindFilter?: string | undefined;
						detail?: Detail | undefined;
						includeMeta?: boolean | undefined;
					}) => {
						const detail = resolveEventDetail(args);
						const storedEvents = await stores.errors.tail(
							tailOptionsFrom({
								limit: args.limit,
								kindFilter: args.kindFilter,
							}),
						);
						const events = compactEvents(storedEvents, detail);
						return toolJson({
							detail,
							events,
							oldestTs: storedEvents[0]?.ts ?? null,
							newestTs: storedEvents.at(-1)?.ts ?? null,
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
							'Return recent redacted log events matching optional outcome/kind filters. `detail` defaults to `normal` (stored event with empty meta), `compact` keeps only the incident summary envelope, and `full` returns the stored event unchanged.',
						inputSchema: z.object({
							outcomeFilter: LogOutcomeSchema.optional(),
							kindFilter: z.string().optional(),
							limit: z.number().optional(),
							detail: DetailSchema.optional(),
						}),
						outputSchema: z.object({
							detail: DetailSchema,
							events: LogEventListOutputSchema,
							stream: z.literal('logs'),
						}),
					},
					async (args: {
						outcomeFilter?: LogOutcome | undefined;
						kindFilter?: string | undefined;
						limit?: number | undefined;
						detail?: Detail | undefined;
					}) => {
						const detail = resolveEventDetail(args);
						const storedEvents = await store.tail(
							tailOptionsFrom({
								...args,
								limit: args.limit ?? SUBSCRIBE_DEFAULT_LIMIT,
							}),
						);
						return toolJson({
							detail,
							stream: 'logs' as const,
							events: compactEvents(storedEvents, detail),
						});
					},
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
							'Build a chronological chain for exactly one taskId or agent and return gap detection. `detail` defaults to `normal` (stored event with empty meta), `compact` keeps only the incident summary envelope, and `full` returns the stored event unchanged.',
						inputSchema: z.object({
							taskId: z.string().optional(),
							agent: z.string().optional(),
							since: z.string().optional(),
							until: z.string().optional(),
							detail: DetailSchema.optional(),
						}),
						// x00107: SUCCESS shape only — the SDK skips schema
						// validation for `isError` results (`toolError`), so
						// the strict required fields are correct. (x00105
						// briefly loosened this; reverted.)
						outputSchema: z.object({
							detail: DetailSchema,
							chain: LogEventListOutputSchema,
							firstTs: z.string().nullable(),
							lastTs: z.string().nullable(),
							gaps: z.unknown(),
						}),
					},
					async (args: {
						taskId?: string | undefined;
						agent?: string | undefined;
						since?: string | undefined;
						until?: string | undefined;
						detail?: Detail | undefined;
					}) => {
						try {
							const detail = resolveEventDetail(args);
							const correlation = await correlateEvents(
								store,
								correlateOptionsFrom(args),
							);
							return toolJson({
								detail,
								...correlation,
								chain: compactEvents(correlation.chain, detail),
							});
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
						description: `Record a structured incident into the redacted event log. \`incidentType\` must be a lower-case slug in \`${INCIDENT_TYPE_PATTERN_DOC}\`. The new event lands in the main timeline (not the curated error stream) with \`severity\`, \`incidentType\` and the caller-supplied \`message\` so it is filterable by \`query\`/\`search\`/\`incidents\`.`,
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
						const summary = `incident-logged: ${args.incidentType} \u2014 ${args.message.slice(0, INCIDENT_SUMMARY_PREVIEW_CHARS)}`;
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
				'Full-text / regex search over event summary, local error diagnostics, args and result.',
			tags: ['logs', 'observability'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_search`,
					{
						description:
							'Search the redacted event log. `pattern` is a substring by default; pass `isRegex:true` for a JavaScript regular expression. `scope` narrows the surface (`summary` | `error` | `args` | `result` | `all`; default `all`). `detail` defaults to `normal`, `compact` keeps only the incident summary envelope, and `full` returns the public sanitized event projection. Returns the matched events with `matched` count and `hasMore` pagination.',
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
							detail: DetailSchema.optional(),
						}),
						outputSchema: z.object({
							detail: DetailSchema,
							events: LogEventListOutputSchema,
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
						detail?: Detail | undefined;
					}) => {
						try {
							const detail = resolveEventDetail(args);
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
								detail,
								events: compactEvents(page, detail),
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
			// Auto-detector. Reads the curated error stream
			// (NOT the main timeline) and clusters failing events by
			// `(toolName, hash(error.message))` so recurring incidents
			// surface as one record with a count.
			id: 'incidents',
			summary:
				'Cluster recurring failing events by tool plus redacted error fingerprint so the same bug surfaces once with a count.',
			tags: ['logs', 'observability', 'audit', 'incident'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_incidents`,
					{
						description:
							'Read the curated error stream and group failing events by tool plus a stable redacted error fingerprint. Each cluster carries `count`, `distinctAgents`, `firstSeen`, `lastSeen`, `sampleSummary`, `errorFingerprint` and the most recent sanitized `recentEvents`. Clusters with fewer than `minCount` (default 2) matches are dropped. Use this for the "what is broken right now" question \u2014 it returns the same bug many times, ONCE.',
						inputSchema: z.object({
							since: z.string().optional(),
							until: z.string().optional(),
							minCount: z.number().optional(),
							agent: z.string().optional(),
							recentLimit: z.number().optional(),
						}),
						outputSchema: z.object({
							incidents: z.unknown(),
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
						const incidents = await logIncidents(
							stores.errors,
							args,
						);
						return toolJson({
							incidents: incidents.incidents.map((incident) =>
								publicIncident(incident),
							),
							totalIncidents: incidents.totalIncidents,
						});
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
