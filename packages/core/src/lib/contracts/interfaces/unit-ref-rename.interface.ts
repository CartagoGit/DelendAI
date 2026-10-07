/** Renaming a unit of work without changing what it holds. */

/** The names and the commit of a rename. */
export interface IRefRename {
	/** The ref as it stands, logical (no `refs/heads/`). */
	readonly from: string;
	/** The ref it becomes, logical. */
	readonly to: string;
	/** The commit both names point at. Unchanged by a rename. */
	readonly sha: string;
}
