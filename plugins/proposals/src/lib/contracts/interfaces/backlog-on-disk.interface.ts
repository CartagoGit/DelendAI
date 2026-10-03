/** Contracts for `../../proposals/backlog-on-disk`. */

/**
 * What the proposals directory holds, as far as it could be read.
 *
 * Three answers, because they lead to three different next steps. `ok`
 * is a count to compare with the index. `missing` is a real empty
 * backlog. `unreadable` is a question nobody has answered, and it must
 * never be the reason an agent creates a proposal that may already exist.
 */
export type IBacklogProbe =
	| { readonly status: 'ok'; readonly count: number }
	| { readonly status: 'missing' }
	| {
			readonly status: 'unreadable';
			/** The directory that could not be listed. */
			readonly dir: string;
			readonly reason: string;
	  };
