/**
 * review-attribution.interface.ts — the contract behind
 * `../../services/review-attribution.ts`.
 */
import type { IGitRunner } from '../../shared/git-runner';

/** Who delivered a slice, as Git proves it. */
export interface IReviewAttribution {
	/** Full hash of the delivering commit. */
	readonly commit: string;
	/** The agent the delivery is attributed to. */
	readonly implementer: string;
	/** Where the name came from, in words a reader can re-check. */
	readonly source: string;
}

export type IReviewAttributionResult =
	| { readonly ok: true; readonly attribution: IReviewAttribution }
	| {
			readonly ok: false;
			/**
			 * `unattributed`: the commit is this slice's, but nothing names
			 * who wrote it. `unrelated`: the commit is not this slice's.
			 * `unusable`: no commit, a malformed one, or one not in the clone.
			 */
			readonly kind: 'unattributed' | 'unrelated' | 'unusable';
			/** Why no implementer could be established. */
			readonly reason: string;
			/** The datum that would make the attribution possible. */
			readonly missing: string;
	  };

export interface IAttributeDeliveryInput {
	readonly run: IGitRunner;
	readonly proposalId: string;
	/** The slice's declared files; the commit must touch one or cite the id. */
	readonly declaredFiles: readonly string[];
	readonly commitHash: string;
	/** Integration branch the delivery was merged into. */
	readonly integration: string;
	/** The project's ref shape; absent ⇒ only Co-Authored-By trailers count. */
	readonly refShape?: IWorkRefShape | undefined;
}

/** Reviewer ≠ implementer, checked against the implementer Git named. */
export type IAttributedApproverCheck =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly reason: 'self-approve';
			readonly nextAction: string;
	  };

/**
 * How the project names its units of work: the development policy's
 * `branches` fields, passed through untouched so attribution decodes a
 * ref the way the project wrote it.
 */
export interface IWorkRefShape {
	readonly workRefTemplate: string;
	readonly workRefPrefix: string;
	readonly publicationRefPrefix: string;
}

/** A unit of work named in some text, decoded with the project's template. */
export interface IWorkRefMention {
	/** The work ref, fully qualified, as the template reads it. */
	readonly ref: string;
	readonly agent: string;
	readonly proposal: string;
	readonly slice: string;
}
