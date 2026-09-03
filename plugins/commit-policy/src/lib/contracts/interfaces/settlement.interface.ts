/**
 * settlement.interface.ts — the shapes of the settlement phase and the
 * worker registry that drives it.
 *
 * Split out of `settlement/worker-registry.ts` per the
 * `types-in-contracts` convention, so a reader that only needs to know
 * what a phase IS does not have to import the registry.
 */

export type ISettlementPhase = 'active' | 'settling' | 'stable';

export interface ISettlementState {
	readonly activeWorkers: number;
	readonly phase: ISettlementPhase;
	readonly lastZeroAt?: number;
	readonly lastGreenHead?: string;
	readonly registeringAt: { readonly [agentId: string]: number };
}

export interface IWorkerRegistry {
	register(agentId: string): Promise<void>;
	dispose(agentId: string): Promise<void>;
	read(): Promise<ISettlementState>;
	setPhase(phase: ISettlementPhase): Promise<void>;
	markGreen(headSha: string): Promise<void>;
}

export interface IWorkerRegistryOptions {
	readonly workspaceRoot: string;
	readonly fileRel?: string | undefined;
}
