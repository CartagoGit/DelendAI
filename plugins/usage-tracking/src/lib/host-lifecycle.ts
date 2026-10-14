/**
 * Transcript-free host lifecycle reading and summarisation.
 *
 * A host adapter owns event capture because it alone knows conversation and
 * compaction boundaries. This plugin stores no prompt, transcript path, model
 * output, quota or inferred turn. A matching MCP id is evidence only when a
 * host has explicitly supplied that exact opaque id to both channels.
 */
import z from 'zod';

import { readAbsoluteTextSafe } from '@delendai/core/public';

import type {
	HostLifecycleEventKind,
	IHostLifecycleEvent,
	IInvocationRecord,
	IObservedHostSession,
} from './types';

const HOST_SESSION_ID_MAX_LENGTH = 512;

const HostLifecycleEventSchema = z.object({
	version: z.literal(1),
	host: z.literal('claude-code'),
	hostSessionId: z.string().trim().min(1).max(HOST_SESSION_ID_MAX_LENGTH),
	event: z.enum(['turn', 'pre-compact', 'post-compact', 'session-end']),
	at: z.string().datetime(),
});

const timestampOf = (event: IHostLifecycleEvent): number => {
	const parsed = Date.parse(event.at);
	return Number.isNaN(parsed) ? 0 : parsed;
};

/** Read a lifecycle NDJSON file, skipping partial or malformed rows. */
export const readHostLifecycleEvents = async (
	absPath: string,
): Promise<IHostLifecycleEvent[]> => {
	let raw: string;
	try {
		raw = await readAbsoluteTextSafe(absPath);
	} catch {
		return [];
	}
	const events: IHostLifecycleEvent[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		const parsed = HostLifecycleEventSchema.safeParse(
			((): unknown => {
				try {
					return JSON.parse(trimmed);
				} catch {
					return undefined;
				}
			})(),
		);
		if (parsed.success) events.push(parsed.data);
	}
	return events;
};

const countEvents = (
	events: readonly IHostLifecycleEvent[],
	kind: HostLifecycleEventKind,
): number => events.filter((event) => event.event === kind).length;

/**
 * Group host events without pretending that boot-scoped MCP ids represent a
 * host conversation. Matching is opt-in, literal equality only.
 */
export const summarizeHostLifecycle = (
	events: readonly IHostLifecycleEvent[],
	invocations: readonly IInvocationRecord[] = [],
): IObservedHostSession[] => {
	const bySession = new Map<string, IHostLifecycleEvent[]>();
	for (const event of events) {
		if (timestampOf(event) === 0) continue;
		const session = bySession.get(event.hostSessionId) ?? [];
		session.push(event);
		bySession.set(event.hostSessionId, session);
	}
	return [...bySession.entries()]
		.map(([hostSessionId, sessionEvents]) => {
			const ordered = [...sessionEvents].sort(
				(a, b) => timestampOf(a) - timestampOf(b),
			);
			const first = ordered[0];
			const last = ordered.at(-1);
			if (!first || !last) return null;
			const matchingMcpCalls = invocations.filter(
				(invocation) => invocation.sessionId === hostSessionId,
			).length;
			return {
				hostSessionId,
				observedHostOnly: true as const,
				firstActivityAt: first.at,
				lastActivityAt: last.at,
				observedElapsedMs: timestampOf(last) - timestampOf(first),
				turnCount: countEvents(ordered, 'turn'),
				preCompactCount: countEvents(ordered, 'pre-compact'),
				postCompactCount: countEvents(ordered, 'post-compact'),
				sessionEndCount: countEvents(ordered, 'session-end'),
				lastEvent: last.event,
				explicitMcpSessionIdMatch: matchingMcpCalls > 0,
				matchingMcpCalls,
			} satisfies IObservedHostSession;
		})
		.filter((session): session is IObservedHostSession => session !== null)
		.sort(
			(a, b) =>
				Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
		);
};
