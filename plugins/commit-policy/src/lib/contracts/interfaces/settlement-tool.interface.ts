/**
 * settlement-tool.interface.ts — the shapes the settlement tools take
 * and return.
 */

export interface ISettlementStatusOutput {
	readonly phase: 'active' | 'settling' | 'stable';
	readonly activeWorkers: number;
	readonly lastGreenHead?: string;
}

export interface ISettlementToolDeps {
	readonly workspaceRoot: string;
	/**
	 * Registry file, workspace-relative. The plugin keeps it under its
	 * cache dir; pass the same value so the tool and the engine's gate
	 * read one state.
	 */
	readonly fileRel?: string;
}
