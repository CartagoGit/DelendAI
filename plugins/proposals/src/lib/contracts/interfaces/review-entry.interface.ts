/** What moving a proposal into review needs, and what it found. */
export type IReviewEntry =
	| {
			readonly ok: true;
			/** The proposal with every slice naming the commit that delivered it. */
			readonly markdown: string;
			/** The slices whose delivering commit was recorded now. */
			readonly recorded: readonly {
				readonly slice: string;
				readonly commit: string;
			}[];
	  }
	| {
			readonly ok: false;
			readonly code: 'missing-declared-files' | 'undelivered-slices';
			readonly reason: string;
			readonly nextAction: string;
	  };
