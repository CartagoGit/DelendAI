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
 *
 * The condition is detected by LETTING THE OPEN FAIL and classifying the
 * error, rather than probing the filesystem first. Two reasons: an
 * existence probe followed by an open is a race (the file can appear or
 * vanish in between, and the doctor would then throw the very exception
 * this exists to prevent), and `SQLITE_CANTOPEN` is a structured code —
 * far more reliable than matching the words "unable to open".
 */
export const DATABASE_PRESENT_CHECK = 'database-present';

/** SQLite's code for "this database could not be opened at all". */
const CANNOT_OPEN = 'SQLITE_CANTOPEN';

const isCannotOpen = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	(error as { readonly code?: unknown }).code === CANNOT_OPEN;

const unopenableDatabaseResult = (
	sqlitePath: string,
	checkedAt: number,
): IDbDoctorResult => ({
	checks: [
		{
			name: DATABASE_PRESENT_CHECK,
			severity: 'warning',
			message: `Could not open a database at ${sqlitePath}, so no check could run. On a fresh clone or a CI runner this is expected and benign: the file is a rebuildable projection, not a source of truth, and it is created by the first reconcile or the next write. If the path does exist, check its permissions and its parent directory.`,
		},
	],
	healthy: false,
	checkedAt,
});

/** Open read-only, or report why the doctor had nothing to examine. */
const openForDiagnosis = (
	sqlitePath: string,
): ProposalsSqliteDriver | 'unopenable' => {
	try {
		return new ProposalsSqliteDriver({
			path: sqlitePath,
			readonly: true,
		});
	} catch (error) {
		// Anything OTHER than "cannot open" is a real fault — a corrupt
		// header, a bad build — and must keep propagating rather than be
		// reported as a benign absence.
		if (!isCannotOpen(error)) throw error;
		return 'unopenable';
	}
};

export const runDbDoctor = (options: IDbDoctorOptions): IDbDoctorResult => {
	const sqlitePath =
		options.sqlitePath ??
		resolveProposalsDbPaths(options.workspaceRoot).databasePath;
	const checkedAt = options.now ?? Date.now();
	const opened = openForDiagnosis(sqlitePath);
	if (opened === 'unopenable')
		return unopenableDatabaseResult(sqlitePath, checkedAt);
	const driver = opened;
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
