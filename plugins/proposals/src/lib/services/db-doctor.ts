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

export const runDbDoctor = (options: IDbDoctorOptions): IDbDoctorResult => {
	const sqlitePath =
		options.sqlitePath ??
		resolveProposalsDbPaths(options.workspaceRoot).databasePath;
	const driver = new ProposalsSqliteDriver({
		path: sqlitePath,
		readonly: true,
	});
	try {
		const checkedAt = options.now ?? Date.now();
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
