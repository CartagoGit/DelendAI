// Peer-review loop for a slice (M35). A slice is implemented, then submitted
// for review instead of being closed directly; a DIFFERENT agent verifies it.
// Approve → done. Find a fault → changes_requested (with an objection), the
// slice is reworked and re-submitted, and ANOTHER agent reviews the fix. The
// loop repeats until a reviewer has no objection.
//
// State lives in the proposal doc (consistent with the no-sidecar model), in
// dedicated lines that don't collide with the existing `- status:` marker —
// `- status: done` is set only on approval, so the board/claim logic is intact.

export type IReviewStatus = 'none' | 'in_review' | 'changes_requested' | 'done';
export type IReviewAction = 'submit' | 'approve' | 'request_changes';

export interface IReviewRound {
	readonly verdict: 'requested_changes' | 'approved';
	readonly agent: string;
	readonly note: string;
}

export interface IReviewState {
	readonly status: IReviewStatus;
	/** Agent who submitted the current round of work (the implementer under review). */
	readonly implementer: string | null;
	/** Last agent who reviewed. */
	readonly reviewer: string | null;
	/** Append-only history of review verdicts. */
	readonly rounds: readonly IReviewRound[];
}

export interface IReviewTransition {
	readonly ok: boolean;
	readonly reason?: string;
	readonly next?: IReviewState;
}

export const EMPTY_REVIEW: IReviewState = {
	status: 'none',
	implementer: null,
	reviewer: null,
	rounds: [],
};

/**
 * Apply a review action. Pure: enforces valid transitions and the core
 * independence rule — a reviewer must NOT be the agent under review.
 */
export const reviewTransition = (
	state: IReviewState,
	action: IReviewAction,
	agent: string,
	note = '',
): IReviewTransition => {
	const who = agent.trim();
	if (who.length === 0) return { ok: false, reason: 'agent is required' };

	if (action === 'submit') {
		if (state.status === 'done') {
			return {
				ok: false,
				reason: 'slice is already approved (done); open a new slice for further work',
			};
		}
		// Implementer claims "ready for review"; a fresh reviewer is awaited.
		return {
			ok: true,
			next: {
				...state,
				status: 'in_review',
				implementer: who,
				reviewer: null,
			},
		};
	}

	// approve / request_changes are reviewer actions on an in-review slice.
	if (state.status !== 'in_review') {
		return {
			ok: false,
			reason: `nothing is in review (status: ${state.status}); submit it first`,
		};
	}
	if (who === state.implementer) {
		return {
			ok: false,
			reason: 'a reviewer must be a different agent than the implementer under review (independent verification)',
		};
	}

	if (action === 'approve') {
		return {
			ok: true,
			next: {
				...state,
				status: 'done',
				reviewer: who,
				rounds: [
					...state.rounds,
					{ verdict: 'approved', agent: who, note: note.trim() },
				],
			},
		};
	}

	// request_changes
	const objection = note.trim();
	if (objection.length === 0) {
		return {
			ok: false,
			reason: 'request_changes needs a note describing the objection',
		};
	}
	return {
		ok: true,
		next: {
			...state,
			status: 'changes_requested',
			reviewer: who,
			rounds: [
				...state.rounds,
				{ verdict: 'requested_changes', agent: who, note: objection },
			],
		},
	};
};

const REVIEW_STATE_RE =
	/^[-*]\s*review-state:\s*(in_review|changes_requested|done)\b/m;
const IMPLEMENTER_RE = /^[-*]\s*review-implementer:\s*(\S+)/m;
const REVIEWER_RE = /^[-*]\s*review-reviewer:\s*(\S+)/m;
const ROUND_RE =
	/^[-*]\s*review-log:\s*(approved|requested_changes)\s+by\s+(\S+)(?:\s+—\s+(.*))?$/gm;

/** Parse review state from a slice block body. Absent lines → EMPTY_REVIEW. */
export const parseReviewState = (body: string): IReviewState => {
	const statusRaw = body.match(REVIEW_STATE_RE)?.[1];
	const status: IReviewStatus =
		statusRaw === 'in_review' ||
		statusRaw === 'changes_requested' ||
		statusRaw === 'done'
			? statusRaw
			: 'none';
	const rounds: IReviewRound[] = [...body.matchAll(ROUND_RE)].map((m) => ({
		verdict: m[1] === 'approved' ? 'approved' : 'requested_changes',
		agent: m[2] ?? '',
		note: (m[3] ?? '').trim(),
	}));
	return {
		status,
		implementer: body.match(IMPLEMENTER_RE)?.[1] ?? null,
		reviewer: body.match(REVIEWER_RE)?.[1] ?? null,
		rounds,
	};
};

/** Canonical review lines for a slice (status/implementer/reviewer + log). */
export const renderReviewLines = (state: IReviewState): string[] => {
	const lines: string[] = [];
	if (state.status !== 'none') lines.push(`- review-state: ${state.status}`);
	if (state.implementer)
		lines.push(`- review-implementer: ${state.implementer}`);
	if (state.reviewer) lines.push(`- review-reviewer: ${state.reviewer}`);
	for (const r of state.rounds) {
		lines.push(
			`- review-log: ${r.verdict} by ${r.agent}${r.note ? ` — ${r.note}` : ''}`,
		);
	}
	return lines;
};
