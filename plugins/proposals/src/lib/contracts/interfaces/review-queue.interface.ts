/**
 * review-queue.interface.ts — the contract behind
 * `../../services/review-queue.service.ts`.
 */
import type { IReviewDrift } from './review-drift.interface';
import type { IGitRunner } from '../../shared/git-runner';
import type { IWorkRefShape } from './review-attribution.interface';

/** A commit that may have delivered a slice, and why it is thought to. */
export interface IDeliveryCandidate {
	readonly commit: string;
	readonly source: string;
	/** The agent whose unit of work delivered it, when its ref names one. */
	readonly agent?: string | undefined;
}

/**
 * What a reviewer has to do about one slice.
 *
 * - `needs-verdict` — verify it and approve or request changes.
 * - `blocked` — no verdict can be recorded until `missing` is supplied.
 * - `waiting-on-implementer` — changes were requested; the fix is not in.
 * - `approved` — nothing left for a reviewer on this slice.
 * - `needs-another-reviewer` — it needs a verdict, and the asker may not
 *   give it: its own model delivered the slice.
 */
export type IReviewQueueVerdict =
	| 'needs-verdict'
	| 'needs-another-reviewer'
	| 'blocked'
	| 'waiting-on-implementer'
	| 'approved';

export interface IReviewQueueSlice {
	readonly sliceId: string;
	readonly title: string;
	/** The slice's own `Status` line, as written. */
	readonly status: string;
	readonly reviewState: string;
	readonly implementer?: string;
	/**
	 * `round`: a submit recorded it. `git`: derived from history.
	 * `unrecorded`: nothing names the author; independence unverifiable.
	 */
	readonly implementerSource?: 'round' | 'git' | 'unrecorded';
	readonly candidates: readonly IDeliveryCandidate[];
	readonly gate?: string;
	readonly files: readonly string[];
	readonly acceptance: readonly string[];
	readonly verdict: IReviewQueueVerdict;
	readonly nextAction: string;
	/** For `blocked`: the datum that would unblock it. */
	readonly missing?: string;
	/**
	 * Commits on the integration branch AFTER the delivering commit that
	 * touched this slice's files. A later proposal may have changed or
	 * reverted what the slice delivered: the slice is judged on what it
	 * delivered, and these are named, not held against it.
	 */
	readonly changedSince?: readonly {
		readonly commit: string;
		readonly subject: string;
	}[];
	/** More later commits exist than `changedSince` lists. */
	readonly changedSinceTruncated?: boolean;
}

export interface IReviewQueueProposal {
	readonly id: string;
	readonly file: string;
	readonly date?: string;
	readonly slices: readonly IReviewQueueSlice[];
	/** Present once every slice is approved: how the proposal closes. */
	readonly close?: string;
	/** Other agents holding a review unit on this proposal: skip it. */
	readonly claimedBy?: readonly string[];
	/** How to claim it, when nobody else holds it. */
	readonly claim?: string;
	/**
	 * How old the review is and how far the repository moved under it since
	 * the work landed; the queue is ordered by it, largest first (f00640).
	 */
	readonly drift?: IReviewDrift;
}

export interface IReviewQueueTotals {
	readonly proposals: number;
	readonly slices: number;
	readonly needsVerdict: number;
	readonly blocked: number;
	readonly waitingOnImplementer: number;
	readonly readyToClose: number;
	/** Proposals another agent is reviewing. */
	readonly claimedByOthers: number;
}

export interface IReviewQueue {
	/** Oldest first; limited to the requested page. */
	readonly proposals: readonly IReviewQueueProposal[];
	/** Over the whole backlog, not just the page. */
	readonly totals: IReviewQueueTotals;
	/** Where this page sits, and the call for the next one if any. */
	readonly page: {
		readonly offset: number;
		readonly returned: number;
		readonly total: number;
		readonly next?: string;
	};
	/**
	 * The caller's pack, when it named its unit: proposals claimed of the
	 * pack it publishes as one pull request.
	 */
	readonly pack?: IReviewPack;
	/** The backlog in one sentence, naming the unit of every figure. */
	readonly summary: string;
	/** The reviewer's procedure, in one paragraph. */
	readonly procedure: string;
}

/** A review unit's pack: it is published once it holds `size` proposals. */
export interface IReviewPack {
	readonly size: number;
	readonly claimed: number;
	readonly full: boolean;
	/** What to do now that it is full. */
	readonly next?: string;
}

export interface IBuildReviewQueueInput {
	readonly namespacePrefix: string;
	readonly proposalsDirAbs: string;
	readonly run: IGitRunner;
	readonly integration: string;
	readonly refShape?: IWorkRefShape | undefined;
	readonly proposalId?: string | undefined;
	readonly limit: number;
	/** Who is asking; its own claims do not count against it. */
	readonly agent?: string | undefined;
	/**
	 * The asking reviewer's unit (its work ref): its claims, and only its,
	 * are its own, even when another instance shares its agent name.
	 */
	readonly unit?: string | undefined;
	/** Proposals of the listed backlog to skip. */
	readonly offset?: number | undefined;
	/**
	 * Where this reviewer starts among the free proposals. Reviewers that
	 * ask at the same moment, before any has claimed, start apart.
	 */
	readonly spread?: number | undefined;
}

/** A proposal in review, as its file names it. */
export interface IReviewBacklogEntry {
	readonly id: string;
	/** Relative to the proposals directory: `review/<name>.md`. */
	readonly file: string;
	readonly status?: string;
	readonly date?: string;
}
