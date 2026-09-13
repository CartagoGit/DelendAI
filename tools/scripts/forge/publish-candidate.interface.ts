/**
 * Shapes for `./publish-candidate.script`.
 *
 * Kept beside the behaviour rather than inside it so a spec can reason
 * about a publication without spawning git.
 */

/** What the checkout is offering to publish. */
export interface ICandidateContent {
	/** Paths that exist and will be written into the candidate's tree. */
	readonly written: readonly string[];
	/** Paths the integration branch has and the candidate deletes. */
	readonly removed: readonly string[];
	/**
	 * Paths that are absent from the checkout and were never on the
	 * integration branch either — a transient file, not a deletion.
	 * Reported so a publication is never silently different from what
	 * the author saw, and then ignored.
	 */
	readonly vanished: readonly string[];
}

/** Why a publication was refused, in terms the author can act on. */
export interface IPublicationRefusal {
	readonly code:
		| 'NOT_A_PUBLICATION_REF'
		| 'NOTHING_TO_PUBLISH'
		| 'SCOPE_VIOLATION'
		| 'PREFLIGHT_FAILED'
		/** The tree would be identical to the integration branch's. */
		| 'EMPTY_CANDIDATE';
	readonly detail: readonly string[];
}

/** The outcome of a publish attempt. */
export type IPublicationOutcome =
	| {
			readonly kind: 'published';
			readonly ref: string;
			readonly commit: string;
			readonly content: ICandidateContent;
	  }
	| { readonly kind: 'refused'; readonly refusal: IPublicationRefusal };
