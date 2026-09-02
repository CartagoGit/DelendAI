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

/**
 * x00157 S2 — `events[]` grew forever: `state_health`'s
 * `peer-review-bypass-count` metric is meant to be a recent
 * snapshot, but over a long-running host (24h+ uptime is this
 * server's whole design point) it inflated to the lifetime total,
 * turning the derived `healthy` flag into a false-green. Bounded to
 * a TTL window, mirroring `recovery-tools.ts`'s `IRecoveryEventBuffer`
 * `gc(cutoff)`-on-every-`add`/`list` pattern. Overridable ONLY for
 * tests — production always uses the 24h default.
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
let ttlMs = DEFAULT_TTL_MS;

// `Date.now()` is called explicitly (not `new Date()`) because tests
// override `Date.now` to simulate TTL expiry — the bare `Date()`
// constructor reads its own internal clock and ignores that override.
const gc = (nowMs: number): void => {
	const cutoff = nowMs - ttlMs;
	const keep = events.filter((event) => {
		const t = new Date(event.ts).getTime();
		return !Number.isNaN(t) && t >= cutoff;
	});
	events.splice(0, events.length, ...keep);
};

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
	const nowMs = Date.now();
	const event: IPeerReviewBypassEvent = {
		kind: 'peer-review-bypassed',
		ts: new Date(nowMs).toISOString(),
		proposalId: input.proposalId,
		agent: (input.agent ?? 'unknown').trim() || 'unknown',
		reason,
		via: input.via,
	};
	events.push(event);
	gc(nowMs);
	// eslint-disable-next-line no-console -- operator-visible audit trail
	console.warn(
		`[mcp-vertex] peer-review-bypassed proposal=${event.proposalId} via=${event.via} agent=${event.agent} reason=${JSON.stringify(event.reason)}`,
	);
	return event;
};

export const getPeerReviewBypassCount = (): number => {
	gc(Date.now());
	return events.length;
};

export const listPeerReviewBypasses = (): readonly IPeerReviewBypassEvent[] => {
	gc(Date.now());
	return [...events];
};

/** Test-only reset. */
export const resetPeerReviewBypassLog = (): void => {
	events.length = 0;
	ttlMs = DEFAULT_TTL_MS;
};

/** Test-only TTL override — production code must never call this. */
export const setPeerReviewBypassTtlMsForTests = (ms: number): void => {
	ttlMs = ms;
};
