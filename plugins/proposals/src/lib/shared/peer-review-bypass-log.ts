/**
 * a00069 S11 — in-process audit trail for peer-review bypasses
 * (`force:true` / `skipPeerReview:true` on review→done).
 *
 * Session-scoped (process memory). `state_health` reads the count;
 * each bypass also emits a structured log line for operators.
 */

export type IPeerReviewBypassEvent = {
	readonly kind: 'peer-review-bypassed';
	readonly ts: string;
	readonly proposalId: string;
	readonly agent: string;
	readonly reason: string;
	readonly via: 'force' | 'skipPeerReview';
};

const events: IPeerReviewBypassEvent[] = [];

/** Record a host-approved peer-review bypass. reason must be non-empty. */
export const recordPeerReviewBypass = (input: {
	readonly proposalId: string;
	readonly reason: string;
	readonly via: 'force' | 'skipPeerReview';
	readonly agent?: string;
}): IPeerReviewBypassEvent => {
	const reason = input.reason.trim();
	if (reason.length === 0) {
		throw new Error('peer-review bypass requires a non-empty reason');
	}
	const event: IPeerReviewBypassEvent = {
		kind: 'peer-review-bypassed',
		ts: new Date().toISOString(),
		proposalId: input.proposalId,
		agent: (input.agent ?? 'unknown').trim() || 'unknown',
		reason,
		via: input.via,
	};
	events.push(event);
	// eslint-disable-next-line no-console -- operator-visible audit trail
	console.info(
		`[mcp-vertex] peer-review-bypassed proposal=${event.proposalId} via=${event.via} agent=${event.agent} reason=${JSON.stringify(event.reason)}`,
	);
	return event;
};

export const getPeerReviewBypassCount = (): number => events.length;

export const listPeerReviewBypasses = (): readonly IPeerReviewBypassEvent[] => [
	...events,
];

/** Test-only reset. */
export const resetPeerReviewBypassLog = (): void => {
	events.length = 0;
};
