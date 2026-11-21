/**
 * Contract shapes for `./reconciliation-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `reconciliation-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `reconciliation-repo.ts`, so no import site changes.
 */

export type IWorkReconciliationStatus =
	| 'running'
	| 'ok'
	| 'degraded'
	| 'failed';

export interface IWorkReconciliationRunRecord {
	readonly id: number;
	readonly machineId: string;
	readonly repositoryId: number | null;
	readonly startedAt: number;
	readonly completedAt: number | null;
	readonly status: IWorkReconciliationStatus;
	readonly refsDiscovered: number;
	readonly workUnitsRepaired: number;
	readonly generationsRepaired: number;
	readonly claimsReleased: number;
	readonly anomalies: readonly unknown[];
	readonly error: string | null;
}

export interface ICompleteWorkReconciliationArgs {
	readonly id: number;
	readonly status: Exclude<IWorkReconciliationStatus, 'running'>;
	readonly completedAt: number;
	readonly refsDiscovered?: number | undefined;
	readonly workUnitsRepaired?: number | undefined;
	readonly generationsRepaired?: number | undefined;
	readonly claimsReleased?: number | undefined;
	readonly anomalies?: readonly unknown[] | undefined;
	readonly error?: string | undefined;
}
