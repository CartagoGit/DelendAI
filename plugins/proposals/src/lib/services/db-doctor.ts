// effect-boundary-authorized: existsSync guards the bun:sqlite open. The
// driver opens the database file itself, outside ctx.effects, so mediating
// only the existence probe would suggest a supervision that does not exist.
import { existsSync } from 'node:fs';

import type { Database } from 'bun:sqlite';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

export type TDoctorSeverity = 'ok' | 'warning' | 'error';

export interface IDoctorCheck {
	readonly name: string;
	readonly severity: TDoctorSeverity;
	readonly message: string;
	readonly affectedUids?: readonly string[];
}

export interface IDoctorCheckContext {
	readonly db: Database;
	readonly now: number;
}

export type TDoctorCheck = (context: IDoctorCheckContext) => IDoctorCheck;

export const countRows = (db: Database, sql: string): number =>
	db.query<{ count: number }, []>(sql).get()?.count ?? 0;

export const checkCount = (
	name: string,
	count: number,
	message: string,
	severity: TDoctorSeverity = 'warning',
): IDoctorCheck => ({
	name,
	severity: count === 0 ? 'ok' : severity,
	message: count === 0 ? 'No issues detected.' : message,
});

export const runDoctorChecks = (
	db: Database,
	checks: readonly TDoctorCheck[],
	now = Date.now(),
): readonly IDoctorCheck[] => {
	const context = { db, now };
	return checks.map((check) => check(context));
};

export interface IDbDoctorOptions {
	readonly workspaceRoot: string;
	readonly sqlitePath?: string;
	readonly checks: readonly TDoctorCheck[];
	readonly now?: number;
}

export interface IDbDoctorResult {
	readonly checks: readonly IDoctorCheck[];
	readonly healthy: boolean;
	readonly checkedAt: number;
}

/**
 * The one check a doctor can always answer: is there a database to
 * examine at all?
 *
 * The proposals database is a MATERIALIZED VIEW — derived, rebuildable,
 * never synced between machines and deliberately gitignored. So its
 * absence is the normal state of a fresh clone or a CI runner, not
 * corruption. Opening it `readonly` in that state throws `unable to open
 * database file`, which turned the diagnostic tool into the thing that
 * needed diagnosing.
 *
 * The verdict is therefore tri-state, exactly like the governance gates:
 * the tool RAN (so it does not crash and callers still get a well-formed
 * result), it did not pass (so `healthy` stays false and nobody can read
 * a green light into an empty result), and the message names the remedy
 * instead of the errno.
 */
export const DATABASE_PRESENT_CHECK = 'database-present';

const absentDatabaseResult = (
	sqlitePath: string,
	checkedAt: number,
): IDbDoctorResult => ({
	checks: [
		{
			name: DATABASE_PRESENT_CHECK,
			severity: 'warning',
			message: `No database at ${sqlitePath} yet, so no check could run. This is expected on a fresh clone or a CI runner: the file is a rebuildable projection, not a source of truth, and it is created by the first reconcile or the next write.`,
		},
	],
	healthy: false,
	checkedAt,
});

export const runDbDoctor = (options: IDbDoctorOptions): IDbDoctorResult => {
	const sqlitePath =
		options.sqlitePath ??
		resolveProposalsDbPaths(options.workspaceRoot).databasePath;
	const checkedAt = options.now ?? Date.now();
	if (!existsSync(sqlitePath))
		return absentDatabaseResult(sqlitePath, checkedAt);
	const driver = new ProposalsSqliteDriver({
		path: sqlitePath,
		readonly: true,
	});
	try {
		const checks = runDoctorChecks(
			driver.handle,
			options.checks,
			checkedAt,
		);
		return {
			checks,
			healthy: checks.every((check) => check.severity === 'ok'),
			checkedAt,
		};
	} finally {
		driver.close();
	}
};
