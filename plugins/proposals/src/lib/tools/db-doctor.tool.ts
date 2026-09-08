import { existsSync } from 'node:fs';

import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';
import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';

import { runDbDoctor, type IDbDoctorResult, type TDoctorCheck } from '../services/db-doctor';
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

export const DEFAULT_DOCTOR_CHECKS: readonly TDoctorCheck[] = [
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
	readonly checks?: readonly TDoctorCheck[];
}

export const runDbDoctorTool = (
	options: IDbDoctorToolOptions,
): IDbDoctorResult => runDbDoctor({
		workspaceRoot: options.workspaceRoot,
		checks: options.checks ?? DEFAULT_DOCTOR_CHECKS,
	});

export const buildDbDoctorToolRegistration = (
	options: IDbDoctorToolOptions,
): IToolRegistration => ({
	id: DB_DOCTOR_REGISTRATION_ID,
	disclosure: 'administrative',
	summary: 'Read-only diagnostics for the proposals SQLite database.',
	tags: ['proposals', 'database', 'diagnostics', 'read'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_db_doctor`,
			{
				title: 'Proposals DB doctor (read-only)',
				description: 'Run independent read-only integrity and consistency checks. Never writes to the database.',
				inputSchema: dbDoctorInputSchema.shape,
				outputSchema: dbDoctorOutputSchema.shape,
			},
			async () => toolJson(runDbDoctorTool(options)),
		);
	},
});

export const dbDoctorDatabaseExists = (workspaceRoot: string): boolean =>
	existsSync(resolveProposalsDbPaths(workspaceRoot).databasePath);
