/** Contract shapes for `./maintain-ref-namespace`. */

/** One thing the namespace maintenance did, or declined to do. */
export interface IRefAction {
	/** Logical ref name, without `refs/heads/` or a remote prefix. */
	readonly ref: string;
	readonly kind: 'rename' | 'reap' | 'left-alone';
	/** Why, in words a person reading a log can act on. */
	readonly detail: string;
	/** False in a read-only run, and when an apply declined. */
	readonly applied: boolean;
}

/** What one maintenance pass saw and did. */
export interface IRefNamespaceReport {
	readonly integration: string;
	readonly remote: string;
	readonly actions: readonly IRefAction[];
}
