/**
 * settlement-tool.interface.ts — the shapes the settlement tools take
 * and return.
 */

export interface ISettlementStatusOutput {
	readonly phase: 'active' | 'settling' | 'stable';
	readonly activeWorkers: number;
	readonly lastGreenHead?: string;
	/**
	 * Present and `false` when the shared agent lock could not be read, so
	 * the number of workers holding live claims is unknown.
	 */
	readonly liveClaimsReadable?: boolean;
}

export interface ISettlementToolDeps {
	readonly workspaceRoot: string;
	/**
	 * Registry file, workspace-relative. The plugin keeps it under its
	 * cache dir; pass the same value so the tool and the engine's gate
	 * read one state.
	 */
	readonly fileRel?: string;
	/**
	 * Workers holding live claims in the shared agent lock, or `null` when
	 * the lock cannot be read. Omit it to count registered workers only.
	 */
	readonly liveWorkers?: () => Promise<number | null>;
}
