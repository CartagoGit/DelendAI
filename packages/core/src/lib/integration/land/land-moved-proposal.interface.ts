/**
 * Contract shapes for refreshing a proposal file a publication moved while
 * the integration branch edited its old copy.
 */

/** One path the head moved (`from` to `to`) that the tip edited at `from`. */
export interface IMovedProposalConflict {
	readonly from: string;
	readonly to: string;
	/** The merge base's copy at `from`. */
	readonly base: string;
	/** The tip's copy at `from`. */
	readonly tip: string;
	/** The head's copy at `to`. */
	readonly moved: string;
}

/** What the queue knows of a refused merge of the tip into a head. */
export interface IMovedProposalPorts {
	/** The rename/modify conflicts, one per path the head moved and the tip edited. */
	readonly moves: readonly IMovedProposalConflict[];
	/** Every other path that conflicts. */
	readonly otherConflicts: readonly string[];
	/** Three-way text merge of the tip's edit onto the moved copy; undefined when it does not apply. */
	mergeText(base: string, tip: string, moved: string): string | undefined;
}

export type IMovedProposalRefresh =
	| {
			readonly kind: 'carried';
			readonly writes: readonly {
				readonly path: string;
				readonly content: string;
			}[];
			readonly removes: readonly string[];
	  }
	| { readonly kind: 'asked'; readonly comment: string };
