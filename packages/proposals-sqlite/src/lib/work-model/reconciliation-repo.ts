/**
 * reconciliation-repo.ts — the audit trail of work-model rebuilds.
 *
 * WHY a separate table from the existing `reconciliation_runs`: that
 * one audits the MARKDOWN reconcile (proposals/plans/slices projected
 * from the tree). This one audits the FORGE reconcile — walking refs,
 * PRs and checks to rebuild `work_units`, `generations` and `claims`.
 * They have different inputs, different failure modes and different
 * counters, and collapsing them would make "what did the last
 * reconcile do?" ambiguous. Hence `work_reconciliation_runs` (0016).
 *
 * A run is opened as `running` and closed exactly once, so a crashed
 * reconcile is visible afterwards as a run that never completed rather
 * than as no evidence at all.
 */
import type { Database } from 'bun:sqlite';

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

interface IRunRow {
	readonly id: number;
	readonly machine_id: string;
	readonly repository_id: number | null;
	readonly started_at: number;
	readonly completed_at: number | null;
	readonly status: IWorkReconciliationStatus;
	readonly refs_discovered: number;
	readonly work_units_repaired: number;
	readonly generations_repaired: number;
	readonly claims_released: number;
	readonly anomalies_json: string | null;
	readonly error: string | null;
}

const RUN_COLUMNS = `id, machine_id, repository_id, started_at, completed_at,
	status, refs_discovered, work_units_repaired, generations_repaired,
	claims_released, anomalies_json, error`;

const parseAnomalies = (json: string | null): readonly unknown[] => {
	if (json === null) return [];
	const parsed: unknown = JSON.parse(json);
	return Array.isArray(parsed) ? parsed : [];
};

const mapRow = (row: IRunRow): IWorkReconciliationRunRecord => ({
	id: row.id,
	machineId: row.machine_id,
	repositoryId: row.repository_id,
	startedAt: row.started_at,
	completedAt: row.completed_at,
	status: row.status,
	refsDiscovered: row.refs_discovered,
	workUnitsRepaired: row.work_units_repaired,
	generationsRepaired: row.generations_repaired,
	claimsReleased: row.claims_released,
	anomalies: parseAnomalies(row.anomalies_json),
	error: row.error,
});

export class WorkReconciliationRepo {
	constructor(private readonly db: Database) {}

	start(args: {
		readonly machineId: string;
		readonly repositoryId?: number | undefined;
		readonly startedAt: number;
	}): IWorkReconciliationRunRecord {
		const id = Number(
			this.db
				.prepare(
					`INSERT INTO work_reconciliation_runs (
						machine_id, repository_id, started_at, status
					) VALUES (?, ?, ?, 'running')`,
				)
				.run(args.machineId, args.repositoryId ?? null, args.startedAt)
				.lastInsertRowid,
		);
		const row = this.get(id);
		if (!row) throw new Error('work reconciliation run did not persist');
		return row;
	}

	/** Closes an open run. A run already completed is left untouched. */
	complete(
		args: ICompleteWorkReconciliationArgs,
	): IWorkReconciliationRunRecord | null {
		this.db
			.prepare(
				`UPDATE work_reconciliation_runs
				 SET status = ?, completed_at = ?, refs_discovered = ?,
					 work_units_repaired = ?, generations_repaired = ?,
					 claims_released = ?, anomalies_json = ?, error = ?
				 WHERE id = ? AND completed_at IS NULL`,
			)
			.run(
				args.status,
				args.completedAt,
				args.refsDiscovered ?? 0,
				args.workUnitsRepaired ?? 0,
				args.generationsRepaired ?? 0,
				args.claimsReleased ?? 0,
				args.anomalies === undefined
					? null
					: JSON.stringify(args.anomalies),
				args.error ?? null,
				args.id,
			);
		return this.get(args.id);
	}

	get(id: number): IWorkReconciliationRunRecord | null {
		const row = this.db
			.query<IRunRow, [number]>(
				`SELECT ${RUN_COLUMNS} FROM work_reconciliation_runs WHERE id = ?`,
			)
			.get(id);
		return row ? mapRow(row) : null;
	}
}
