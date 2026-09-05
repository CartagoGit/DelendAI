// Peer-review loop for a slice. A slice is implemented, then submitted
// for review instead of being closed directly; a DIFFERENT agent verifies it.
// Approve → done. Find a fault → changes_requested (with an objection), the
// slice is reworked and re-submitted, and ANOTHER agent reviews the fix. The
// loop repeats until a reviewer has no objection.
//
// State lives in the proposal doc (consistent with the no-sidecar model), in
// dedicated lines that don't collide with the existing `- status:` marker —
// `- status: done` is set only on approval, so the board/claim logic is intact.
//
// f00508 S1 — the review panel. A slice can require agreement from more than
// one independent reviewer before it closes, so that a reviewer sharing the
// implementer's blind spot (very likely when both are the same model) is not
// the only thing standing between a fault and `done`.
//
// The panel agrees by UNANIMITY, never by majority. A single
// `request_changes` from any member blocks the close immediately, without
// waiting for the rest of the panel to weigh in. Majority voting would be
// actively worse than one reviewer: with three reviewers, two shallow
// approvals bury the one reviewer who found the real fault, and the system
// returns more confidence carrying less truth. Under unanimity every added
// member is one more chance to FIND the fault and never one more chance to
// outvote it.
//
// The quorum needs no new serialized state. The approvals standing in the
// current round are exactly the `approved` entries in the log after the most
// recent `requested_changes` — so a document written before this existed
// reads correctly with no migration, and reopening a round drops the
// accumulated approvals for free, which is the right thing anyway: an
// approval is evidence about a specific state of the code, and reworking the
// slice invalidates it.

export type IReviewStatus = 'none' | 'in_review' | 'changes_requested' | 'done';
export type IReviewAction = 'submit' | 'approve' | 'request_changes';

export interface IReviewRound {
	/**
	 * `resubmitted` is not a verdict a reviewer casts — it is the
	 * implementer handing in reworked code, recorded in the same log so
	 * that the approvals standing before it are visibly void rather than
	 * silently carried over onto work nobody has looked at.
	 */
	readonly verdict: 'requested_changes' | 'approved' | 'resubmitted';
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
 * The approvals standing right now, i.e. those cast since the slice was last
 * reworked. Derived rather than stored, so there is exactly one source of
 * truth and no way for a counter to drift from the log it summarises.
 */
export const standingApprovals = (state: IReviewState): readonly string[] => {
	const lastReset = state.rounds
		.map((round) => round.verdict !== 'approved')
		.lastIndexOf(true);
	return state.rounds
		.slice(lastReset + 1)
		.filter((round) => round.verdict === 'approved')
		.map((round) => round.agent);
};

export interface IReviewTransitionOptions {
	/**
	 * Suppresses the reviewer-is-not-the-implementer check. Kept for the
	 * callers that already relied on it; the panel does not change it.
	 */
	readonly enforceDistinctAgentName?: boolean;
	/**
	 * How many distinct approvals close the slice. Defaults to 1, which is
	 * the pre-panel contract — with a quorum of one, every path below
	 * behaves exactly as it did before, so turning the panel off is not a
	 * separate branch of code that could rot untested.
	 */
	readonly quorum?: number;
}

/**
 * Apply a review action. Pure: enforces valid transitions and the core
 * independence rule — a reviewer must NOT be the agent under review.
 */
export const reviewTransition = (
	state: IReviewState,
	action: IReviewAction,
	agent: string,
	note = '',
	options?: IReviewTransitionOptions,
): IReviewTransition => {
	const who = agent.trim();
	if (who.length === 0) return { ok: false, reason: 'agent is required' };
	const enforceDistinctAgentName =
		options?.enforceDistinctAgentName !== false;
	const quorum = Math.max(1, Math.trunc(options?.quorum ?? 1));

	if (action === 'submit') {
		if (state.status === 'done') {
			return {
				ok: false,
				reason: 'slice is already approved (done); open a new slice for further work',
			};
		}
		// Implementer claims "ready for review"; a fresh reviewer is awaited.
		// Handing in reworked code voids any approval already standing: an
		// approval is evidence about the state of the code that reviewer
		// read, and this is no longer that state. The void is written into
		// the log so it is auditable, and only when there is something to
		// void, so a first submit stays quiet.
		const voided = standingApprovals(state);
		return {
			ok: true,
			next: {
				...state,
				status: 'in_review',
				implementer: who,
				reviewer: null,
				rounds:
					voided.length === 0
						? state.rounds
						: [
								...state.rounds,
								{
									verdict: 'resubmitted' as const,
									agent: who,
									note: `resubmitted; ${voided.length.toString()} standing approval(s) void (${voided.join(', ')}) — they were given for a different state of the code`,
								},
							],
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
	if (enforceDistinctAgentName && who === state.implementer) {
		return {
			ok: false,
			reason: 'a reviewer must be a different agent than the implementer under review (independent verification)',
		};
	}
	// A panel is only worth its cost if its members are actually distinct.
	// One agent approving twice would satisfy the count while contributing
	// a single point of view — the exact failure the quorum exists to
	// prevent — so it is refused by name rather than silently counted once.
	//
	// Checked BEFORE the chain rule below, which would otherwise catch the
	// same agent first and answer with the wrong reason: "you reviewed the
	// prior round" is not why a second approval on THIS round is refused,
	// and a reviewer told that has been handed a misdiagnosis to act on.
	const standing = standingApprovals(state);
	if (action === 'approve' && standing.includes(who)) {
		return {
			ok: false,
			reason: `${who} has already approved this round; a quorum of ${quorum.toString()} needs ${quorum.toString()} DIFFERENT reviewers, so hand it to an agent that has not seen it yet (so far: ${standing.join(', ')})`,
		};
	}

	// Chain-of-distinct-reviewers rule (x00056): the SAME reviewer cannot
	// verify two consecutive rounds. After a `request_changes`, the next
	// reviewer must be a fresh agent — never the previous one who already
	// weighed in. This keeps the loop honest: every round of changes
	// gets a fresh pair of eyes, never a rubber-stamp by the same agent
	// who already objected (or approved an earlier round).
	// The last agent to cast a VERDICT, skipping the implementer's own
	// `resubmitted` entries — otherwise handing in a fix would mask the
	// previous reviewer and let them rubber-stamp their own objection,
	// which is the rule x00056 added.
	const lastRound = state.rounds
		.filter((round) => round.verdict !== 'resubmitted')
		.at(-1);
	if (lastRound !== undefined && lastRound.agent === who) {
		return {
			ok: false,
			reason: `a reviewer must be a different agent than the previous reviewer (${who} already reviewed the prior round); call a fresh agent to verify this fix`,
		};
	}
	if (action === 'approve') {
		const rounds = [
			...state.rounds,
			{ verdict: 'approved' as const, agent: who, note: note.trim() },
		];
		// The slice closes only once the quorum is complete. Until then it
		// stays `in_review`: an approval that does not close anything must
		// not read like one that does, and the board must keep showing the
		// slice as awaiting review, because it is.
		const reached = standing.length + 1 >= quorum;
		return {
			ok: true,
			next: {
				...state,
				status: reached ? 'done' : 'in_review',
				reviewer: who,
				rounds,
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
	/^[-*]\s*review-log:\s*(approved|requested_changes|resubmitted)\s+by\s+(\S+)(?:\s+—\s+(.*))?$/gm;

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
		verdict:
			m[1] === 'approved'
				? 'approved'
				: m[1] === 'resubmitted'
					? 'resubmitted'
					: 'requested_changes',
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

/**
 * a00069 S7 — true when the proposal markdown has at least one slice with a
 * completed peer review: `review-state: done`, an implementer, a reviewer
 * distinct from the implementer, and an `approved` review-log entry.
 * Whole-doc scan (slice blocks separated by `### ` headings).
 */
export const hasPeerApprovedReview = (markdown: string): boolean => {
	// Strip frontmatter so YAML cannot spoof review lines.
	const body = markdown.replace(/^---[\s\S]*?---\s*/, '');
	const blocks = body.split(/^### /m);
	for (const block of blocks) {
		const state = parseReviewState(block);
		if (state.status !== 'done') continue;
		if (state.implementer === null || state.reviewer === null) continue;
		if (state.implementer === state.reviewer) continue;
		if (!state.rounds.some((r) => r.verdict === 'approved')) continue;
		return true;
	}
	return false;
};
