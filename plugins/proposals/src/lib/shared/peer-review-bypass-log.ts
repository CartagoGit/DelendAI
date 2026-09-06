/**
 * a00069 S11 — in-process audit trail for peer-review bypasses
 * (`force:true` / `skipPeerReview:true` on review→done).
 *
 * Session-scoped (process memory). `state_health` reads the count;
 * each bypass also emits a structured log line for operators.
 *
 * c00513 — the `log` parameter lets callers route the bypass through
 * `ctx.logs.log` (the canonical structured channel) instead of the
 * default `console.warn`. The default is preserved for backward
 * compatibility with the 50+ plugin callers that have not been
 * migrated yet, but every new caller SHOULD pass a sink so the
 * bypass lands in the same JSONL stream as every other audit
 * event. The `reason` text is run through `redactSecrets` before
 * emission so an operator who pastes a token into the bypass reason
 * does not leak it into the log.
 */

import { redactSecrets } from '@delendai/core/public';

export type IPeerReviewBypassEvent = {
	readonly kind: 'peer-review-bypassed';
	readonly ts: string;
	readonly proposalId: string;
	readonly agent: string;
	readonly reason: string;
	readonly via: 'force' | 'skipPeerReview';
};

/**
 * Minimal contract the bypass loggers need from `ctx.logs.log`.
 * Matches the surface every plugin already calls; declared inline
 * (not imported from `@delendai/core`) so this shared module stays
 * project-agnostic.
 */
export type IBypassLogSink = (entry: {
	readonly severity: 'warning';
	readonly incidentType: 'peer-review-bypass' | 'plan-closure-bypass';
	readonly message: string;
	readonly context: Readonly<Record<string, unknown>>;
}) => void | Promise<void>;

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

/** Record a host-approved peer-review bypass. reason must be non-empty.
 *
 * c00513: callers SHOULD pass `log` so the bypass lands in the
 * canonical `ctx.logs.log` JSONL stream; otherwise the bypass emits
 * a `console.warn` line (backward-compat default for the ~50 plugin
 * callers that haven't been migrated yet). The bypass is always
 * recorded in the session-scoped buffer regardless.
 */
export const recordPeerReviewBypass = (input: {
	readonly proposalId: string;
	readonly reason: string;
	readonly via: 'force' | 'skipPeerReview';
	readonly agent?: string;
	readonly log?: IBypassLogSink;
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
	// c00513: prefer the structured sink when the caller wired one.
	// The `redactSecrets` call strips GitHub PATs / AWS keys / JWT
	// out of the operator-supplied reason so a bypass-log entry
	// cannot exfiltrate secrets pasted into the UI.
	const redactedReason = redactSecrets(event.reason).text;
	const logPayload = {
		severity: 'warning' as const,
		incidentType: 'peer-review-bypass' as const,
		message: `[delendai] peer-review-bypassed proposal=${event.proposalId} via=${event.via} agent=${event.agent} reason=${JSON.stringify(redactedReason)}`,
		context: {
			proposalId: event.proposalId,
			via: event.via,
			agent: event.agent,
			reason: redactedReason,
		},
	};
	if (input.log !== undefined) {
		void Promise.resolve(input.log(logPayload));
		return event;
	}
	// eslint-disable-next-line no-console -- operator-visible audit trail.
	// MUST be `warn`, never `info`/`log`: this runs inside the MCP stdio
	// server, where stdout IS the JSON-RPC channel. Writing an audit line
	// there corrupts the protocol stream, and the client reports it as
	// "Failed to parse message" with no hint of where it came from.
	// `lint:no-stdout-in-runtime` enforces this.
	console.warn(
		`[delendai] peer-review-bypassed proposal=${event.proposalId} via=${event.via} agent=${event.agent} reason=${JSON.stringify(event.reason)}`,
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
