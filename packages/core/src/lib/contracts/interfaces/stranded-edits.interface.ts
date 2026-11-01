/** The edits kept, or why nothing was. */
export type IStrandedEdits =
	| { readonly outcome: 'clean' | 'not-shared-checkout' }
	| {
			readonly outcome: 'kept' | 'already-kept';
			readonly ref: string;
			readonly agent: string;
			readonly paths: readonly string[];
	  }
	| { readonly outcome: 'failed'; readonly reason: string };
