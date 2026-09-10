/**
 * Contract shapes for `./db-doctor`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `db-doctor.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `db-doctor.ts`, so no import site changes.
 */

import type { Database } from 'bun:sqlite';

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
