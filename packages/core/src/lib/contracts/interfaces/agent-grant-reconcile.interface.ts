/**
 * agent-grant-reconcile.interface.ts — what bringing a project's agent
 * grants in line with its server changed.
 */

/** One agent file whose server grant was rewritten. */
export interface IAgentGrantChange {
	/** The file, relative to the workspace root. */
	readonly path: string;
	/** The grants removed: references to no server the project registers. */
	readonly removed: readonly string[];
	/** The grant that now names delendai's server. */
	readonly granted: string;
}
