// effect-boundary-authorized: existsSync guards the bun:sqlite open. The
// driver opens the database file itself, outside ctx.effects, so mediating
// only the existence probe would suggest a supervision that does not exist.

import { existsSync } from 'node:fs';

import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';
import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';

import {
	runDbDoctor,
	type IDbDoctorOptions,
	type IDbDoctorResult,
	type IDoctorCheckFn,
} from '../services/db-doctor';
import { checkCommandReceipts } from '../services/db-doctor/checks/command-receipts';
import { checkDuplicateNaturalIds } from '../services/db-doctor/checks/duplicates';
import { checkEnumParity } from '../services/db-doctor/checks/enum-parity';
import { checkForeignKeys } from '../services/db-doctor/checks/foreign-keys';
import { checkGitShaMismatch } from '../services/db-doctor/checks/git-sha-mismatch';
import { checkIntegrity } from '../services/db-doctor/checks/integrity';
import { checkInvalidStatuses } from '../services/db-doctor/checks/invalid-statuses';
import { checkLifecycleAnomalies } from '../services/db-doctor/checks/lifecycle-anomalies';
import { checkMissingRelations } from '../services/db-doctor/checks/missing-relations';
import { checkOrphans } from '../services/db-doctor/checks/orphans';
import { checkOutboxBacklog } from '../services/db-doctor/checks/outbox-backlog';
import { checkQuarantinedImports } from '../services/db-doctor/checks/quarantined-imports';
import { checkRevisionInconsistencies } from '../services/db-doctor/checks/revision-inconsistencies';
import { checkStaleReconciliation } from '../services/db-doctor/checks/stale-reconciliation';
import { buildStorageModeCheck } from '../services/db-doctor/checks/storage-mode';
import { getProposalIndexReadStats } from '../proposals/index-read-stats';
import { resolveProposalIndexSource } from '../proposals/index-reader';

export const dbDoctorInputSchema = z.object({});

export const dbDoctorCheckSchema = z.object({
	name: z.string(),
	severity: z.enum(['ok', 'warning', 'error']),
	message: z.string(),
	affectedUids: z.array(z.string()).optional(),
});

export const dbDoctorOutputSchema = z.object({
	checks: z.array(dbDoctorCheckSchema),
	healthy: z.boolean(),
	checkedAt: z.number().int().nonnegative(),
});

export const DB_DOCTOR_REGISTRATION_ID = 'proposals_db_doctor';

export const DEFAULT_DOCTOR_CHECKS: readonly IDoctorCheckFn[] = [
	checkIntegrity,
	checkForeignKeys,
	checkOrphans,
	checkDuplicateNaturalIds,
	checkInvalidStatuses,
	checkMissingRelations,
	checkRevisionInconsistencies,
	checkQuarantinedImports,
	checkStaleReconciliation,
	checkGitShaMismatch,
	checkOutboxBacklog,
	checkLifecycleAnomalies,
	checkEnumParity,
	checkCommandReceipts,
];

export interface IDbDoctorToolOptions {
	readonly workspaceRoot: string;
	readonly namespacePrefix?: string;
	readonly checks?: readonly IDoctorCheckFn[];
	/** Environment the index source switch is read from; defaults to `process.env`. */
	readonly env?: Readonly<Record<string, string | undefined>>;
	/** DIP seam for the SQL checks runner; defaults to the real one, which needs `bun:sqlite`. */
	readonly runDoctor?: (options: IDbDoctorOptions) => IDbDoctorResult;
}

/**
 * Runs the SQL checks, then appends the storage-mode report. That report
 * needs no open database, so it is present even when the database is
 * missing, which is exactly when the configured mode matters most.
 */
export const runDbDoctorTool = (
	options: IDbDoctorToolOptions,
): IDbDoctorResult => {
	const databasePath = resolveProposalsDbPaths(
		options.workspaceRoot,
	).databasePath;
	const result = (options.runDoctor ?? runDbDoctor)({
		workspaceRoot: options.workspaceRoot,
		sqlitePath: databasePath,
		checks: options.checks ?? DEFAULT_DOCTOR_CHECKS,
	});
	const storage = buildStorageModeCheck({
		mode: resolveProposalIndexSource({ env: options.env ?? process.env }),
		databasePath,
		stats: getProposalIndexReadStats(),
	});
	return {
		...result,
		checks: [...result.checks, storage],
		healthy: result.healthy && storage.severity === 'ok',
	};
};

export const buildDbDoctorToolRegistration = (
	options: IDbDoctorToolOptions,
): IToolRegistration => ({
	id: DB_DOCTOR_REGISTRATION_ID,
	disclosure: 'administrative',
	summary: 'Read-only diagnostics for the proposals SQLite database.',
	tags: ['proposals', 'database', 'diagnostics', 'read'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_proposals_db_doctor`,
			{
				title: 'Proposals DB doctor (read-only)',
				description:
					'Run independent read-only integrity and consistency checks. Never writes to the database.',
				inputSchema: dbDoctorInputSchema,
				outputSchema: dbDoctorOutputSchema,
			},
			async () => toolJson(runDbDoctorTool(options)),
		);
	},
});

export const dbDoctorDatabaseExists = (workspaceRoot: string): boolean =>
	existsSync(resolveProposalsDbPaths(workspaceRoot).databasePath);
