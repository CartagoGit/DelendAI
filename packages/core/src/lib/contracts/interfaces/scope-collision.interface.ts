/** Another agent already changing a path this checkpoint claims. */

/** One unit of work whose paths overlap the scope being claimed. */
export interface IScopeCollision {
	/** The identity that owns the other unit, from its ref's own name. */
	readonly agent: string;
	/** Its logical ref, without `refs/heads/` or a remote prefix. */
	readonly ref: string;
	/** What the rest of that ref's name says it is about. */
	readonly subject: string;
	/** Only the paths both are changing. */
	readonly paths: readonly string[];
}
