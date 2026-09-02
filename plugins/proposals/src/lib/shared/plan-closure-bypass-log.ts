/**
 * plan-closure-bypass-log.ts — in-process audit trail for the
 * `skipDfaForPlanClosure` shortcut used by `proposals_close_plan`.
 *
 * After `proposals_close_plan` runs the closure preflight (every
 * child proposal, sub-plan, and own slice is `done` + peer-reviewed),
 * it forwards the verified plan to `runProposalTransition` with
 * `skipDfaForPlanClosure: true`. That shortcut is the ONLY way a plan
 * can land on `done` without first passing through `review/`, so
 * every skip MUST be audited: proposal id, caller reason, the
 * `via: 'plan-closure-shortcut'` marker.
 *
 * The buffer mirrors `peer-review-bypass-log.ts` (24h TTL window,
 * GC on every read/write, console.info for operator visibility,
 * session-scoped — the `state_health` plugin reads the count for
 * `plan-closure-bypass-count`).
 *
 * x00157 S2 pattern: bounded TTL prevents a long-running host
 * (24h+ uptime is the whole design point) from inflating the metric
 * to a lifetime total. Overridable ONLY for tests.
 */
export type IPlanClosureBypassEvent = {
	readonly kind: 'plan-closure-bypassed';
	readonly ts: string;
	readonly proposalId: string;
	readonly agent: string;
	readonly reason: string;
	readonly via: 'plan-closure-shortcut';
};

const events: IPlanClosureBypassEvent[] = [];

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
let ttlMs = DEFAULT_TTL_MS;

const gc = (nowMs: number): void => {
	const cutoff = nowMs - ttlMs;
	const keep = events.filter((event) => {
		const t = new Date(event.ts).getTime();
		return !Number.isNaN(t) && t >= cutoff;
	});
	events.splice(0, events.length, ...keep);
};

/** Record a plan-closure DFA skip. reason must be non-empty. */
export const recordPlanClosureBypass = (input: {
	readonly proposalId: string;
	readonly reason: string;
	readonly agent?: string;
}): IPlanClosureBypassEvent => {
	const reason = input.reason.trim();
	if (reason.length === 0) {
		throw new Error('plan-closure bypass requires a non-empty reason');
	}
	const nowMs = Date.now();
	const event: IPlanClosureBypassEvent = {
		kind: 'plan-closure-bypassed',
		ts: new Date(nowMs).toISOString(),
		proposalId: input.proposalId,
		agent: (input.agent ?? 'unknown').trim() || 'unknown',
		reason,
		via: 'plan-closure-shortcut',
	};
	events.push(event);
	gc(nowMs);
	// eslint-disable-next-line no-console -- operator-visible audit trail.
	// MUST be `warn`, never `info`/`log`: this runs inside the MCP stdio
	// server, where stdout IS the JSON-RPC channel. Writing an audit line
	// there corrupts the protocol stream, and the client reports it as
	// "Failed to parse message" with no hint of where it came from.
	// `lint:no-stdout-in-runtime` enforces this.
	console.warn(
		`[mcp-vertex] plan-closure-bypassed proposal=${event.proposalId} via=${event.via} agent=${event.agent} reason=${JSON.stringify(event.reason)}`,
	);
	return event;
};

export const getPlanClosureBypassCount = (): number => {
	gc(Date.now());
	return events.length;
};

export const listPlanClosureBypasses =
	(): readonly IPlanClosureBypassEvent[] => {
		gc(Date.now());
		return [...events];
	};

/** Test-only reset. */
export const resetPlanClosureBypassLog = (): void => {
	events.length = 0;
	ttlMs = DEFAULT_TTL_MS;
};

/** Test-only TTL override — production code must never call this. */
export const setPlanClosureBypassTtlMsForTests = (ms: number): void => {
	ttlMs = ms;
};
