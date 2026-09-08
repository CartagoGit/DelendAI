import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
	ProposalsSqliteDriver,
	type IProposalsSqliteDriverOptions,
} from './sqlite-driver';
import {
	reconcileProposalMarkdown,
	type IMarkdownReconcileInput,
	type IReconcilerInputFile,
} from './reconciler-markdown';
import { ProposalRepo } from './repository/proposals-repo';
import { PlanRepo } from './repository/plans-repo';
import { SliceRepo } from './repository/slices-repo';
import { QuarantineRepo } from './repository/quarantine-repo';

export interface IShadowReconcileInput {
	readonly mode: 'shadow';
	readonly workspacePath: string;
	readonly statePath: string;
	readonly sourceCommit: string;
	readonly sha: string;
	readonly files: IMarkdownReconcileInput['files'];
	readonly now?: number;
	readonly reconcilerVersion?: string;
	readonly driver?: Pick<IProposalsSqliteDriverOptions, 'apply'>;
}

export interface IIntegrityCheckResult {
	readonly status: 'ok' | 'failed' | 'not-run';
	readonly details: readonly string[];
}

export interface IForeignKeyViolation {
	readonly table: string;
	readonly rowId: number;
	readonly parent: string;
	readonly foreignKeyIndex: number;
}

export interface IForeignKeyCheckResult {
	readonly status: 'ok' | 'failed' | 'not-run';
	readonly violations: readonly IForeignKeyViolation[];
}

export interface IShadowReconcileResult {
	readonly mode: 'shadow';
	readonly sourceCommit: string;
	readonly sourceSha: string;
	readonly workspacePath: string;
	readonly statePath: string;
	readonly stagingPath: string;
	readonly failedStagingPath: string | null;
	readonly filesSeen: number;
	readonly proposalsStaged: number;
	readonly plansStaged: number;
	readonly slicesStaged: number;
	readonly stagingDigest: string;
	readonly integrity: IIntegrityCheckResult;
	readonly foreignKey: IForeignKeyCheckResult;
	readonly status: 'ok' | 'degraded' | 'failed';
	readonly error: string | null;
}

interface IReconciliationRunInsertArgs {
	readonly sourceCommit: string;
	readonly sourceTree: string;
	readonly reconcilerVersion: string;
	readonly schemaVersion: number;
	readonly startedAt: number;
	readonly status: 'ok' | 'degraded';
	readonly filesSeen: number;
	readonly logicalDigest: string;
}

interface IReconciliationRunFinalizeArgs {
	readonly id: number;
	readonly completedAt: number;
	readonly status: 'ok' | 'degraded' | 'failed';
	readonly filesChanged: number;
	readonly entitiesCreated: number;
	readonly entitiesUpdated: number;
	readonly entitiesDeleted: number;
	readonly entitiesQuarantined: number;
	readonly logicalDigest: string;
	readonly error: string | null;
}

interface IIntegrityCheckRow {
	readonly integrity_check?: string;
	readonly quick_check?: string;
}

interface IForeignKeyCheckRow {
	readonly table: string;
	readonly rowid: number;
	readonly parent: string;
	readonly fkid: number;
}

const RECONCILER_VERSION = 'q00024-s1';

const removeSqliteArtifacts = (path: string): void => {
	rmSync(path, { force: true });
	rmSync(`${path}-wal`, { force: true });
	rmSync(`${path}-shm`, { force: true });
};

const finalizeWal = (driver: ProposalsSqliteDriver | null): void => {
	if (driver === null) return;
	driver.handle.exec('PRAGMA wal_checkpoint(TRUNCATE);');
	driver.close();
};

const readFirstText = (row: IIntegrityCheckRow): string | null => {
	if (typeof row.integrity_check === 'string') return row.integrity_check;
	if (typeof row.quick_check === 'string') return row.quick_check;
	for (const value of Object.values(row)) {
		if (typeof value === 'string') return value;
	}
	return null;
};

const runIntegrityCheck = (
	driver: ProposalsSqliteDriver,
): IIntegrityCheckResult => {
	const rows = driver.handle
		.query<IIntegrityCheckRow, []>('PRAGMA integrity_check;')
		.all();
	const details = rows
		.map((row) => readFirstText(row))
		.filter((value): value is string => value !== null);
	if (details.length === 1 && details[0] === 'ok') {
		return { status: 'ok', details };
	}
	return { status: 'failed', details };
};

const runForeignKeyCheck = (
	driver: ProposalsSqliteDriver,
): IForeignKeyCheckResult => {
	const rows = driver.handle
		.query<IForeignKeyCheckRow, []>('PRAGMA foreign_key_check;')
		.all();
	if (rows.length === 0) {
		return { status: 'ok', violations: [] };
	}
	return {
		status: 'failed',
		violations: rows.map((row) => ({
			table: row.table,
			rowId: row.rowid,
			parent: row.parent,
			foreignKeyIndex: row.fkid,
		})),
	};
};

const insertReconciliationRun = (
	driver: ProposalsSqliteDriver,
	args: IReconciliationRunInsertArgs,
): number => {
	const result = driver.handle
		.prepare(
			`INSERT INTO reconciliation_runs (
				source_commit, source_tree, reconciler_version,
				schema_version, started_at, completed_at, status,
				files_seen, files_changed, entities_created,
				entities_updated, entities_deleted, entities_quarantined,
				logical_digest, kind, error
			) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, 0, 0, 0, 0, ?, 'shadow', NULL)`,
		)
		.run(
			args.sourceCommit,
			args.sourceTree,
			args.reconcilerVersion,
			args.schemaVersion,
			args.startedAt,
			args.status,
			args.filesSeen,
			args.logicalDigest,
		);
	return Number(result.lastInsertRowid);
};

const finalizeReconciliationRun = (
	driver: ProposalsSqliteDriver,
	args: IReconciliationRunFinalizeArgs,
): void => {
	driver.handle
		.prepare(
			`UPDATE reconciliation_runs
			 SET completed_at = ?,
				 status = ?,
				 files_changed = ?,
				 entities_created = ?,
				 entities_updated = ?,
				 entities_deleted = ?,
				 entities_quarantined = ?,
				 logical_digest = ?,
				 error = ?
			 WHERE id = ?`,
		)
		.run(
			args.completedAt,
			args.status,
			args.filesChanged,
			args.entitiesCreated,
			args.entitiesUpdated,
			args.entitiesDeleted,
			args.entitiesQuarantined,
			args.logicalDigest,
			args.error,
			args.id,
		);
};

const renameFailedStaging = (
	stagingPath: string,
	now: number,
): string | null => {
	if (!existsSync(stagingPath)) return null;
	const failedPath = `${stagingPath}.failed-${new Date(now).toISOString()}.sqlite`;
	renameSync(stagingPath, failedPath);
	removeSqliteArtifacts(stagingPath);
	return failedPath;
};

const notRunIntegrity = (): IIntegrityCheckResult => ({
	status: 'not-run',
	details: [],
});

const notRunForeignKey = (): IForeignKeyCheckResult => ({
	status: 'not-run',
	violations: [],
});

const blobShaFor = (file: IReconcilerInputFile, sourceSha: string): string =>
	typeof file.sha === 'string' && file.sha.trim() !== ''
		? file.sha
		: sourceSha;

export const reconcileShadowToStaging = (
	input: IShadowReconcileInput,
): IShadowReconcileResult => {
	const startedAt = input.now ?? Date.now();
	const stagingPath = join(input.statePath, 'proposals.sqlite.staging');
	mkdirSync(input.statePath, { recursive: true });
	removeSqliteArtifacts(stagingPath);

	const reconciled = reconcileProposalMarkdown({
		sourceCommit: input.sourceCommit,
		files: input.files,
		mode: 'shadow',
	});

	let driver: ProposalsSqliteDriver | null = null;
	let runId: number | null = null;
	let created = 0;
	let updated = 0;
	let proposalsStaged = 0;
	let plansStaged = 0;
	let slicesStaged = 0;
	let integrity = notRunIntegrity();
	let foreignKey = notRunForeignKey();
	let failedStagingPath: string | null = null;

	try {
		const driverOptions: IProposalsSqliteDriverOptions = {
			path: stagingPath,
			...(input.driver?.apply ? { apply: input.driver.apply } : {}),
		};
		driver = new ProposalsSqliteDriver(driverOptions);
		runId = insertReconciliationRun(driver, {
			sourceCommit: input.sourceCommit,
			sourceTree: input.sha,
			reconcilerVersion: input.reconcilerVersion ?? RECONCILER_VERSION,
			schemaVersion: driver.schemaVersion,
			startedAt,
			status: reconciled.status,
			filesSeen: reconciled.filesSeen,
			logicalDigest: reconciled.logicalDigest,
		});

		const proposalRepo = new ProposalRepo(driver.handle);
		for (const proposal of reconciled.proposals) {
			const outcome = proposalRepo.upsertProjection(proposal, startedAt);
			if (outcome.kind === 'created') created += 1;
			if (outcome.kind === 'updated') updated += 1;
			proposalsStaged += 1;
		}

		// Plans and slices are projected after proposals so the FK to
		// `proposals(id)` / `plans(id)` always resolves. The repos set
		// `closed_at` for terminal statuses themselves, which is what
		// the 0008 parity triggers require.
		const planRepo = new PlanRepo(driver.handle);
		const planIdByUid = new Map<string, number>();
		for (const plan of reconciled.plans) {
			const proposal = proposalRepo.getByUid(plan.proposalUid);
			if (proposal === null) {
				throw new Error(
					`plan ${plan.uid} references unknown proposal ${plan.proposalUid}`,
				);
			}
			const record = planRepo.create({
				uid: plan.uid,
				proposalId: proposal.id,
				slug: plan.slug,
				title: plan.title,
				sourcePath: plan.path,
				status: plan.status,
				now: startedAt,
			});
			planIdByUid.set(record.uid, record.id);
			created += 1;
			plansStaged += 1;
		}

		const sliceRepo = new SliceRepo(driver.handle);
		for (const slice of reconciled.slices) {
			const planId = planIdByUid.get(slice.planUid);
			if (planId === undefined) {
				throw new Error(
					`slice ${slice.uid} references unknown plan ${slice.planUid}`,
				);
			}
			sliceRepo.create({
				uid: slice.uid,
				planId,
				slug: slice.slug,
				title: slice.title,
				sourcePath: slice.path,
				status: slice.status,
				now: startedAt,
			});
			created += 1;
			slicesStaged += 1;
		}

		const quarantineRepo = new QuarantineRepo(driver.handle);
		for (const quarantined of reconciled.quarantined) {
			const file = input.files.find(
				(entry) => entry.path === quarantined.path,
			);
			quarantineRepo.record({
				sourcePath: quarantined.path,
				blobSha: blobShaFor(
					file ?? { path: quarantined.path, raw: '' },
					input.sha,
				),
				errorCode: quarantined.errorCode,
				errorMessage: quarantined.errorMessage,
				rawMetadata: null,
				runId,
				now: startedAt,
			});
		}

		integrity = runIntegrityCheck(driver);
		foreignKey = runForeignKeyCheck(driver);
		if (integrity.status === 'failed' || foreignKey.status === 'failed') {
			const error =
				integrity.status === 'failed'
					? `integrity_check failed: ${integrity.details.join('; ')}`
					: `foreign_key_check failed: ${foreignKey.violations
							.map(
								(violation) =>
									`${violation.table}:${String(violation.rowId)}->${violation.parent}:${String(violation.foreignKeyIndex)}`,
							)
							.join('; ')}`;
			finalizeReconciliationRun(driver, {
				id: runId,
				completedAt: startedAt,
				status: 'failed',
				filesChanged: created + updated + reconciled.quarantined.length,
				entitiesCreated: created,
				entitiesUpdated: updated,
				entitiesDeleted: 0,
				entitiesQuarantined: reconciled.quarantined.length,
				logicalDigest: reconciled.logicalDigest,
				error,
			});
			finalizeWal(driver);
			driver = null;
			failedStagingPath = renameFailedStaging(stagingPath, startedAt);
			return {
				mode: 'shadow',
				sourceCommit: input.sourceCommit,
				sourceSha: input.sha,
				workspacePath: input.workspacePath,
				statePath: input.statePath,
				stagingPath,
				failedStagingPath,
				filesSeen: reconciled.filesSeen,
				proposalsStaged,
				plansStaged,
				slicesStaged,
				stagingDigest: reconciled.logicalDigest,
				integrity,
				foreignKey,
				status: 'failed',
				error,
			};
		}

		finalizeReconciliationRun(driver, {
			id: runId,
			completedAt: startedAt,
			status: reconciled.status,
			filesChanged: created + updated + reconciled.quarantined.length,
			entitiesCreated: created,
			entitiesUpdated: updated,
			entitiesDeleted: 0,
			entitiesQuarantined: reconciled.quarantined.length,
			logicalDigest: reconciled.logicalDigest,
			error: null,
		});
		finalizeWal(driver);
		driver = null;
		return {
			mode: 'shadow',
			sourceCommit: input.sourceCommit,
			sourceSha: input.sha,
			workspacePath: input.workspacePath,
			statePath: input.statePath,
			stagingPath,
			failedStagingPath: null,
			filesSeen: reconciled.filesSeen,
			proposalsStaged,
			plansStaged,
			slicesStaged,
			stagingDigest: reconciled.logicalDigest,
			integrity,
			foreignKey,
			status: reconciled.status,
			error: null,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (driver !== null && runId !== null) {
			finalizeReconciliationRun(driver, {
				id: runId,
				completedAt: startedAt,
				status: 'failed',
				filesChanged: created + updated + reconciled.quarantined.length,
				entitiesCreated: created,
				entitiesUpdated: updated,
				entitiesDeleted: 0,
				entitiesQuarantined: reconciled.quarantined.length,
				logicalDigest: reconciled.logicalDigest,
				error: message,
			});
		}
		if (driver !== null) {
			finalizeWal(driver);
			driver = null;
		}
		failedStagingPath = renameFailedStaging(stagingPath, startedAt);
		return {
			mode: 'shadow',
			sourceCommit: input.sourceCommit,
			sourceSha: input.sha,
			workspacePath: input.workspacePath,
			statePath: input.statePath,
			stagingPath,
			failedStagingPath,
			filesSeen: reconciled.filesSeen,
			proposalsStaged,
			plansStaged,
			slicesStaged,
			stagingDigest: reconciled.logicalDigest,
			integrity,
			foreignKey,
			status: 'failed',
			error: message,
		};
	}
};
