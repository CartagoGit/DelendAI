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
	/** Paths removed from the checkout, and so from the candidate. */
	readonly removed: readonly string[];
}

/** Why a publication was refused, in terms the author can act on. */
export interface IPublicationRefusal {
	readonly code:
		| 'NOT_A_PUBLICATION_REF'
		| 'NOTHING_TO_PUBLISH'
		| 'SCOPE_VIOLATION'
		| 'PREFLIGHT_FAILED';
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
