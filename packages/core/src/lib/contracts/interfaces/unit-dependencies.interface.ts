/**
 * unit-dependencies.interface.ts — what entering a unit did about its dependencies.
 */

export type IUnitDependencies =
	| { readonly status: 'present' }
	| { readonly status: 'installed'; readonly command: string }
	| { readonly status: 'skipped'; readonly reason: string }
	| {
			readonly status: 'failed';
			readonly command: string;
			readonly reason: string;
	  };

/** A unit no longer live whose dependencies the reaper gave back. */
export interface IReleasedDependencies {
	readonly ref: string;
	readonly worktree: string;
	/** False when the reaper only reported it (no `--apply`). */
	readonly removed: boolean;
}
