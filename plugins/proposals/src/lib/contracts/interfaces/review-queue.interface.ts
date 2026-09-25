/**
 * review-queue.interface.ts — the contract behind
 * `../../services/review-queue.service.ts`.
 */
import type { IGitRunner } from '../../shared/git-runner';
import type { IWorkRefShape } from './review-attribution.interface';

/** A commit that may have delivered a slice, and why it is thought to. */
export interface IDeliveryCandidate {
	readonly commit: string;
	readonly source: string;
}

/**
 * What a reviewer has to do about one slice.
 *
 * - `needs-verdict` — verify it and approve or request changes.
 * - `blocked` — no verdict can be recorded until `missing` is supplied.
 * - `waiting-on-implementer` — changes were requested; the fix is not in.
 * - `approved` — nothing left for a reviewer on this slice.
 */
export type IReviewQueueVerdict =
	| 'needs-verdict'
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
}

export interface IReviewQueueProposal {
	readonly id: string;
	readonly file: string;
	readonly date?: string;
	readonly slices: readonly IReviewQueueSlice[];
	/** Present once every slice is approved: how the proposal closes. */
	readonly close?: string;
}

export interface IReviewQueueTotals {
	readonly proposals: number;
	readonly slices: number;
	readonly needsVerdict: number;
	readonly blocked: number;
	readonly waitingOnImplementer: number;
	readonly readyToClose: number;
}

export interface IReviewQueue {
	/** Oldest first; limited to the requested page. */
	readonly proposals: readonly IReviewQueueProposal[];
	/** Over the whole backlog, not just the page. */
	readonly totals: IReviewQueueTotals;
	/** The reviewer's procedure, in one paragraph. */
	readonly procedure: string;
}

export interface IBuildReviewQueueInput {
	readonly namespacePrefix: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
	readonly run: IGitRunner;
	readonly integration: string;
	readonly refShape?: IWorkRefShape | undefined;
	readonly proposalId?: string | undefined;
	readonly limit: number;
}
