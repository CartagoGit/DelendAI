/**
 * Map SessionHygieneMonitor newly-breached reasons onto the core
 * ICheckpointAdvisory envelope (f00156 S2).
 *
 * Pure over the hygiene advisory. Never claims host context meters or
 * quotas. Age alone is `recommend`; several independent reasons escalate
 * to `strong`. This mapper never returns `block`.
 */
import type { ICheckpointAdvisory } from '@delendai/core/public';

import type { ISessionHygieneAdvisory, SessionHygieneReason } from '../types';

export const SESSION_TOO_LONG_CODE = 'SESSION_TOO_LONG';

const sortReasons = (
	reasons: readonly SessionHygieneReason[],
): readonly SessionHygieneReason[] => [...reasons].sort();

const nextActionFor = (
	reasons: readonly SessionHygieneReason[],
): ICheckpointAdvisory['nextAction'] => {
	if (reasons.length === 1 && reasons[0] === 'idle-gap') {
		return 'checkpoint-and-compact';
	}
	return 'checkpoint-and-fresh-session';
};

const severityFor = (
	reasons: readonly SessionHygieneReason[],
): 'recommend' | 'strong' => (reasons.length >= 2 ? 'strong' : 'recommend');

const messageFor = (nextAction: ICheckpointAdvisory['nextAction']): string =>
	nextAction === 'checkpoint-and-compact'
		? 'At this point, I recommend creating a semantic checkpoint and compacting this session.'
		: 'At this point, I recommend creating a semantic checkpoint and continuing in a fresh agent session.';

const reasonText = (reasons: readonly SessionHygieneReason[]): string => {
	if (reasons.length === 1 && reasons[0] === 'session-age') {
		return 'this session has accumulated enough age that context drift is becoming more likely';
	}
	if (reasons.length === 1 && reasons[0] === 'idle-gap') {
		return 'this session has been idle long enough that a compact/checkpoint is cheaper than carrying stale context';
	}
	if (reasons.length === 1 && reasons[0] === 'mcp-output-volume') {
		return 'this session has accumulated enough MCP output volume that context drift is becoming more likely';
	}
	return 'several independent local MCP session-hygiene thresholds were newly breached';
};

export const sessionTooLongDedupeKey = (
	sessionId: string,
	reasons: readonly SessionHygieneReason[],
): string =>
	`${SESSION_TOO_LONG_CODE}:${sessionId}:${sortReasons(reasons).join(',')}`;

/**
 * Convert a newly-breached hygiene advisory into a checkpoint advisory.
 * Returns null when hygiene did not emit (below threshold / already alerted).
 */
export const mapHygieneToCheckpointAdvisory = (
	hygiene: ISessionHygieneAdvisory | null,
): ICheckpointAdvisory | null => {
	if (hygiene === null) return null;
	if (hygiene.newlyBreached.length === 0) return null;
	const reasons = sortReasons(hygiene.reasons);
	const nextAction = nextActionFor(reasons);
	return {
		triggered: true,
		code: SESSION_TOO_LONG_CODE,
		severity: severityFor(reasons),
		message: messageFor(nextAction),
		reason: reasonText(reasons),
		nextAction,
		dedupeKey: sessionTooLongDedupeKey(hygiene.sessionId, reasons),
	};
};

/**
 * Stateful adapter: remembers the last emitted hygiene advisory so
 * `getCheckpointAdvisory` can re-surface it until core's dedupeKey
 * swallows the duplicate. Plugins must not emit `block` from age.
 */
export class SessionTooLongAdvisorySource {
	private last: ICheckpointAdvisory | null = null;

	noteHygiene(
		hygiene: ISessionHygieneAdvisory | null,
	): ICheckpointAdvisory | null {
		const mapped = mapHygieneToCheckpointAdvisory(hygiene);
		if (mapped !== null) this.last = mapped;
		return mapped;
	}

	current(): ICheckpointAdvisory | null {
		return this.last;
	}
}
