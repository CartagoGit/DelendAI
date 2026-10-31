/**
 * Shapes of a husk: a directory left in the units' folder that is no
 * unit's worktree.
 */

/** A directory beside the units that git knows no worktree for. */
export interface IHusk {
	/** Its name in the units' folder. */
	readonly name: string;
	readonly path: string;
	/** Seconds since anything in it was last written. */
	readonly quietSeconds: number;
}

/** What `work reap` did, or would do, with one husk. */
export interface IReapedHusk {
	readonly name: string;
	readonly path: string;
	readonly outcome: 'removed' | 'would-remove' | 'kept';
	/** Where its files were kept on the forge, when they were work. */
	readonly keptAt: readonly string[];
	/** Why it is still there, when it was kept. */
	readonly reason?: string | undefined;
}
