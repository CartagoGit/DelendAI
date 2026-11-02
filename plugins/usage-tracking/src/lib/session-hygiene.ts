/**
 * Local MCP-session hygiene analysis.
 *
 * This module deliberately reasons only about invocation metadata. A host
 * conversation can contain user messages, model reasoning and non-MCP tools
 * that are invisible here, so every result carries `observedMcpOnly: true`.
 */
import type {
	IInvocationRecord,
	ISessionHygieneAdvisory,
	ISessionHygienePolicy,
	ISessionHygieneSnapshot,
	SessionHygieneReason,
} from './types';
import { BYTES_PER_TOKEN } from './contracts/constants/bytes-per-token.constant';

const DEFAULT_SESSION_AGE_HOURS = 2;
const DEFAULT_IDLE_GAP_MINUTES = 30;

export const DEFAULT_SESSION_HYGIENE_POLICY: ISessionHygienePolicy = {
	maxSessionAgeMs: DEFAULT_SESSION_AGE_HOURS * 60 * 60 * 1000,
	maxIdleGapMs: DEFAULT_IDLE_GAP_MINUTES * 60 * 1000,
	maxMcpOutputTokens: 8_000,
};

const timestampOf = (record: IInvocationRecord): number => {
	const parsed = Date.parse(record.ts);
	return Number.isNaN(parsed) ? 0 : parsed;
};

const estimatedTokens = (responseBytes: number): number =>
	Math.ceil(Math.max(0, responseBytes) / BYTES_PER_TOKEN);

const reasonsFor = (
	observedElapsedMs: number,
	largestIdleGapMs: number,
	outputTokens: number,
	policy: ISessionHygienePolicy,
): SessionHygieneReason[] => {
	const reasons: SessionHygieneReason[] = [];
	if (observedElapsedMs >= policy.maxSessionAgeMs)
		reasons.push('session-age');
	if (largestIdleGapMs >= policy.maxIdleGapMs) reasons.push('idle-gap');
	if (outputTokens >= policy.maxMcpOutputTokens)
		reasons.push('mcp-output-volume');
	return reasons;
};

const snapshotFrom = (
	sessionId: string,
	records: readonly IInvocationRecord[],
	policy: ISessionHygienePolicy,
): ISessionHygieneSnapshot | null => {
	const ordered = [...records]
		.filter((record) => timestampOf(record) > 0)
		.sort((a, b) => timestampOf(a) - timestampOf(b));
	const first = ordered[0];
	const last = ordered.at(-1);
	if (!first || !last) return null;

	let largestIdleGapMs = 0;
	let responseBytes = 0;
	for (let index = 0; index < ordered.length; index += 1) {
		const current = ordered[index]!;
		responseBytes += Math.max(0, current.responseBytes ?? 0);
		const previous = ordered[index - 1];
		if (previous) {
			largestIdleGapMs = Math.max(
				largestIdleGapMs,
				timestampOf(current) - timestampOf(previous),
			);
		}
	}
	const observedElapsedMs = timestampOf(last) - timestampOf(first);
	const outputTokens = estimatedTokens(responseBytes);
	return {
		sessionId,
		observedMcpOnly: true,
		firstActivityAt: first.ts,
		lastActivityAt: last.ts,
		observedElapsedMs,
		largestIdleGapMs,
		calls: ordered.length,
		responseBytes,
		estimatedMcpOutputTokens: outputTokens,
		reasons: reasonsFor(
			observedElapsedMs,
			largestIdleGapMs,
			outputTokens,
			policy,
		),
	};
};

/** Analyze every observed MCP session in a durable invocation log. */
export const analyzeSessionHygiene = (
	records: readonly IInvocationRecord[],
	policy: ISessionHygienePolicy = DEFAULT_SESSION_HYGIENE_POLICY,
): ISessionHygieneSnapshot[] => {
	const bySession = new Map<string, IInvocationRecord[]>();
	for (const record of records) {
		const session = bySession.get(record.sessionId) ?? [];
		session.push(record);
		bySession.set(record.sessionId, session);
	}
	return [...bySession.entries()]
		.map(([sessionId, sessionRecords]) =>
			snapshotFrom(sessionId, sessionRecords, policy),
		)
		.filter(
			(snapshot): snapshot is ISessionHygieneSnapshot =>
				snapshot !== null,
		)
		.sort(
			(a, b) =>
				Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
		);
};

interface IMutableObservedSession {
	firstActivityAt: number;
	lastActivityAt: number;
	largestIdleGapMs: number;
	calls: number;
	responseBytes: number;
	alerted: Set<SessionHygieneReason>;
}

export interface IObserveSessionHygiene {
	readonly sessionId: string;
	readonly at: number;
	readonly responseBytes: number;
}

/**
 * O(1) in-memory monitor for the hot path. It emits only newly breached
 * reasons, preventing a warning from becoming a per-tool context tax.
 */
export class SessionHygieneMonitor {
	private readonly sessions = new Map<string, IMutableObservedSession>();

	constructor(readonly policy: ISessionHygienePolicy) {}

	/** Snapshot the current in-memory observations without reading the log. */
	snapshots(): ISessionHygieneSnapshot[] {
		return [...this.sessions.entries()]
			.map(([sessionId, session]) => {
				const observedElapsedMs =
					session.lastActivityAt - session.firstActivityAt;
				const outputTokens = estimatedTokens(session.responseBytes);
				return {
					sessionId,
					observedMcpOnly: true as const,
					firstActivityAt: new Date(
						session.firstActivityAt,
					).toISOString(),
					lastActivityAt: new Date(
						session.lastActivityAt,
					).toISOString(),
					observedElapsedMs,
					largestIdleGapMs: session.largestIdleGapMs,
					calls: session.calls,
					responseBytes: session.responseBytes,
					estimatedMcpOutputTokens: outputTokens,
					reasons: reasonsFor(
						observedElapsedMs,
						session.largestIdleGapMs,
						outputTokens,
						this.policy,
					),
				};
			})
			.sort(
				(a, b) =>
					Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
			);
	}

	observe(input: IObserveSessionHygiene): ISessionHygieneAdvisory | null {
		const previous = this.sessions.get(input.sessionId);
		const session = previous ?? {
			firstActivityAt: input.at,
			lastActivityAt: input.at,
			largestIdleGapMs: 0,
			calls: 0,
			responseBytes: 0,
			alerted: new Set<SessionHygieneReason>(),
		};
		if (previous) {
			session.largestIdleGapMs = Math.max(
				session.largestIdleGapMs,
				Math.max(0, input.at - session.lastActivityAt),
			);
		}
		session.lastActivityAt = Math.max(session.lastActivityAt, input.at);
		session.calls += 1;
		session.responseBytes += Math.max(0, input.responseBytes);
		this.sessions.set(input.sessionId, session);

		const observedElapsedMs =
			session.lastActivityAt - session.firstActivityAt;
		const outputTokens = estimatedTokens(session.responseBytes);
		const reasons = reasonsFor(
			observedElapsedMs,
			session.largestIdleGapMs,
			outputTokens,
			this.policy,
		);
		const newlyBreached = reasons.filter(
			(reason) => !session.alerted.has(reason),
		);
		for (const reason of newlyBreached) session.alerted.add(reason);
		if (newlyBreached.length === 0) return null;

		return {
			sessionId: input.sessionId,
			observedMcpOnly: true,
			firstActivityAt: new Date(session.firstActivityAt).toISOString(),
			lastActivityAt: new Date(session.lastActivityAt).toISOString(),
			observedElapsedMs,
			largestIdleGapMs: session.largestIdleGapMs,
			calls: session.calls,
			responseBytes: session.responseBytes,
			estimatedMcpOutputTokens: outputTokens,
			reasons,
			newlyBreached,
			recommendedAction: reasons.some(
				(reason) =>
					reason === 'session-age' || reason === 'mcp-output-volume',
			)
				? 'checkpoint-and-compact'
				: 'resume-from-digest',
		};
	}
}
