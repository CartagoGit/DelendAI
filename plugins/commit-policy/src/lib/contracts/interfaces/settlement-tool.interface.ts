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
}
