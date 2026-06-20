import { z } from 'zod';

import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import { correlateEvents } from './correlate';
import type { ILogStore } from './log-store';
import { LOG_OUTCOMES, type LogEventKind } from './normalize-event';
import type { LogOutcome } from './normalize-event';
import { redactTest } from './redact-test';

const LogOutcomeSchema = z.enum(LOG_OUTCOMES);
const LogEventSchema = z.object({
	ts: z.string(),
	kind: z.string(),
	agent: z.string().nullable(),
	taskId: z.string().nullable(),
	outcome: LogOutcomeSchema,
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
} => ({
	...(args.since !== undefined ? { since: args.since } : {}),
	...(args.until !== undefined ? { until: args.until } : {}),
	...(args.kind !== undefined ? { kind: args.kind as LogEventKind } : {}),
	...(args.agent !== undefined ? { agent: args.agent } : {}),
	...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
	...(args.outcome !== undefined ? { outcome: args.outcome } : {}),
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
	store: ILogStore,
): readonly IToolRegistration[] => [
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
					const events = await store.readRange(queryFilterFrom(args));
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
						'Return the newest redacted MCP log events, optionally filtered by outcome or kind.',
					inputSchema: z.object({
						limit: z.number().optional(),
						outcomeFilter: LogOutcomeSchema.optional(),
						kindFilter: z.string().optional(),
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
				}) => {
					const events = await store.tail(tailOptionsFrom(args));
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
		summary: 'Build a timeline for one taskId or agent and flag long gaps.',
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
];
