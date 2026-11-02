/**
 * agent-grant-reconcile.interface.ts — what bringing a project's agent
 * grants in line with its server changed.
 */

/** One delendai-managed agent file and the outcome of reconciling its grant. */
export type IAgentGrantChange =
	| IAgentGrantUpdated
	| IAgentGrantMissingToolsLine;

/** An agent whose tools line was updated; every other byte was preserved. */
export interface IAgentGrantUpdated {
	readonly kind: 'updated';
	/** The file, relative to the workspace root. */
	readonly path: string;
	/** The grants removed: references to no server the project registers. */
	readonly removed: readonly string[];
	/** The grant that now names delendai's server. */
	readonly granted: string;
	/** Reconciliation replaces only the managed tools line. */
	readonly preservedOutsideToolsLine: true;
}

/** An eligible agent without a managed tools line, which was left untouched. */
export interface IAgentGrantMissingToolsLine {
	readonly kind: 'missing-tools-line';
	/** The file, relative to the workspace root. */
	readonly path: string;
}
