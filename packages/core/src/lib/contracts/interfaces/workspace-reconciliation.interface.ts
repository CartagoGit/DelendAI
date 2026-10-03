/**
 * workspace-reconciliation.interface.ts — the shapes a plugin's
 * boot-time reconciliation speaks in.
 *
 * They live in `contracts/` rather than beside the plugin contract
 * because that is where this repository keeps exported types: a
 * contract file that also grows its own type definitions is how the
 * boundary stops being findable.
 */

/** What a boot-time reconciliation is given. */
export interface IWorkspaceReconciliationInput {
	/** Absolute workspace root. */
	readonly workspaceRoot: string;
	/**
	 * The resolved development policy. Undefined when the host config
	 * declares none — reported as an unreconciled boot rather than
	 * defaulted to a model nobody chose.
	 */
	readonly developmentPolicy?: unknown;
	/** Names of every plugin that registered in this boot. */
	readonly peerPlugins: readonly string[];
}

/**
 * What it concluded. `status` is deliberately tri-state and mirrors the
 * reconciler's own vocabulary: a reconciliation that could not run is
 * NOT the same as one that ran and found nothing.
 */
export interface IWorkspaceReconciliationOutcome {
	readonly status: 'reconciled' | 'degraded' | 'not-executable';
	/** One line an operator reads at startup. */
	readonly summary: string;
	/** Optional detail lines, printed under the summary. */
	readonly details?: readonly string[];
}
