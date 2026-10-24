import type { Database } from 'bun:sqlite';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import type {
	IDoctorSeverity,
	IDoctorCheck,
	IDoctorCheckFn,
	IDbDoctorOptions,
	IDbDoctorResult,
} from './db-doctor.interface';
import { DATABASE_PRESENT_CHECK } from './db-doctor.constant';

export type {
	IDoctorSeverity,
	IDoctorCheck,
	IDoctorCheckContext,
	IDoctorCheckFn,
	IDbDoctorOptions,
	IDbDoctorResult,
} from './db-doctor.interface';
export { DATABASE_PRESENT_CHECK } from './db-doctor.constant';

export const countRows = (db: Database, sql: string): number =>
	db.query<{ count: number }, []>(sql).get()?.count ?? 0;

export const checkCount = (
	name: string,
	count: number,
	message: string,
	severity: IDoctorSeverity = 'warning',
): IDoctorCheck => ({
	name,
	severity: count === 0 ? 'ok' : severity,
	message: count === 0 ? 'No issues detected.' : message,
});

export const runDoctorChecks = (
	db: Database,
	checks: readonly IDoctorCheckFn[],
	now = Date.now(),
): readonly IDoctorCheck[] => {
	const context = { db, now };
	return checks.map((check) => check(context));
};

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
