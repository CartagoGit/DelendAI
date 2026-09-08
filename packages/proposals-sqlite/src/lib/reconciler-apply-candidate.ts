import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

import { ProposalsSqliteDriver } from './sqlite-driver';

export interface IApplyValidatedCandidateInput {
	readonly stagingPath: string;
	readonly activePath: string;
	readonly sourceCommit: string;
	readonly expectedDigest?: string;
	readonly now?: number;
}

export interface IApplyValidatedCandidateResult {
	readonly status: 'ok' | 'rejected';
	readonly sourceCommit: string;
	readonly logicalDigest: string | null;
	readonly proposalsApplied: number;
	readonly integrity: readonly string[];
	readonly foreignKeyViolations: readonly string[];
	readonly failedStagingPath: string | null;
	readonly reason: string | null;
}

interface IProposalRow {
	readonly uid: string;
	readonly slug: string;
	readonly kind: string;
	readonly status: string;
	readonly title: string;
	readonly source_path: string | null;
	readonly source_blob_sha: string | null;
	readonly revision: number;
	readonly content_hash: string | null;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
}

interface IRunRow {
	readonly logical_digest: string | null;
	readonly status: 'ok' | 'degraded' | 'failed';
}

const checkIntegrity = (driver: ProposalsSqliteDriver): readonly string[] =>
	driver.handle
		.query<{ readonly integrity_check: string }, []>(
			'PRAGMA integrity_check;'
		)
		.all()
		.map((row) => row.integrity_check);

const checkForeignKeys = (driver: ProposalsSqliteDriver): readonly string[] =>
	driver.handle
		.query<
			{
				readonly table: string;
				readonly rowid: number;
				readonly parent: string;
				readonly fkid: number;
			},
			[]
		>('PRAGMA foreign_key_check;')
		.all()
		.map(
			(row) =>
				`${row.table}:${String(row.rowid)}->${row.parent}:${String(row.fkid)}`
		);

const readStagingRun = (driver: ProposalsSqliteDriver): IRunRow | null =>
	driver.handle
		.query<IRunRow, []>(
			`SELECT logical_digest, status
			 FROM reconciliation_runs
			 WHERE kind = 'shadow'
			 ORDER BY id DESC
			 LIMIT 1`
		)
		.get() ?? null;

const readProposals = (
	driver: ProposalsSqliteDriver
): readonly IProposalRow[] =>
	driver.handle
		.query<IProposalRow, []>(
			`SELECT uid, slug, kind, status, title, source_path,
					source_blob_sha, revision, content_hash, created_at,
					updated_at, closed_at
			 FROM proposals
			 ORDER BY uid`
		)
		.all();

const preserveFailedStaging = (
	stagingPath: string,
	now: number
): string | null => {
	const failedPath = `${stagingPath}.failed-${new Date(now).toISOString()}.sqlite`;
	try {
		mkdirSync(dirname(failedPath), { recursive: true });
		renameSync(stagingPath, failedPath);
		return failedPath;
	} catch {
		return null;
	}
};
export const applyValidatedCandidate = (
	input: IApplyValidatedCandidateInput
): IApplyValidatedCandidateResult => {
	if (!existsSync(input.stagingPath)) {
		return {
			status: 'rejected',
			sourceCommit: input.sourceCommit,
			logicalDigest: null,
			proposalsApplied: 0,
			integrity: [],
			foreignKeyViolations: [],
			failedStagingPath: null,
			reason: `staging database not found: ${input.stagingPath}`,
		};
	}

	let staging: ProposalsSqliteDriver | null = null;
	let active: ProposalsSqliteDriver | null = null;
	try {
		staging = new ProposalsSqliteDriver({
			path: input.stagingPath,
			readonly: true,
		});
		const integrity = checkIntegrity(staging);
		const foreignKeyViolations = checkForeignKeys(staging);
		const stagingRun = readStagingRun(staging);
		const logicalDigest = stagingRun?.logical_digest ?? null;
		const now = input.now ?? Date.now();
		if (
			stagingRun === null ||
			stagingRun.status !== 'ok' ||
			integrity.length !== 1 ||
			integrity[0] !== 'ok' ||
			foreignKeyViolations.length > 0 ||
			(input.expectedDigest !== undefined &&
				logicalDigest !== input.expectedDigest)
		) {
			const reason =
				stagingRun === null
					? 'staging has no completed shadow reconciliation'
					: stagingRun.status !== 'ok'
						? `staging reconciliation status is ${stagingRun.status}`
						: integrity[0] !== 'ok'
							? 'staging integrity_check failed'
							: foreignKeyViolations.length > 0
								? 'staging foreign_key_check failed'
								: 'staging logical digest does not match expected digest';
			staging.close();
			staging = null;
			const failedStagingPath = preserveFailedStaging(
				input.stagingPath,
				now
			);
			return {
				status: 'rejected',
				sourceCommit: input.sourceCommit,
				logicalDigest,
				proposalsApplied: 0,
				integrity,
				foreignKeyViolations,
				failedStagingPath,
				reason,
			};
		}

		const proposals = readProposals(staging);
		staging.close();
		staging = null;
		active = new ProposalsSqliteDriver({ path: input.activePath });
		let proposalsApplied = 0;
		const tx = active.handle.transaction(() => {
			for (const proposal of proposals) {
				const current = active?.handle
					.query<
						{ readonly id: number },
						[string]
					>('SELECT id FROM proposals WHERE uid = ?')
					.get(proposal.uid);
				if (current === null) {
					active?.handle
						.prepare(
							`INSERT INTO proposals (
								uid, slug, kind, status, title, source_path,
								source_blob_sha, revision, content_hash,
								created_at, updated_at, closed_at
							) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
						)
						.run(
							proposal.uid,
							proposal.slug,
							proposal.kind,
							proposal.status,
							proposal.title,
							proposal.source_path,
							proposal.source_blob_sha,
							proposal.content_hash,
							proposal.created_at,
							proposal.updated_at,
							proposal.closed_at
						);
				} else {
					active?.handle
						.prepare(
							`UPDATE proposals
							 SET slug = ?, kind = ?, status = ?, title = ?,
								 source_path = ?, source_blob_sha = ?,
								 content_hash = ?, revision = revision + 1,
								 updated_at = ?, closed_at = ?
							 WHERE uid = ?`
						)
						.run(
							proposal.slug,
							proposal.kind,
							proposal.status,
							proposal.title,
							proposal.source_path,
							proposal.source_blob_sha,
							proposal.content_hash,
							now,
							proposal.closed_at,
							proposal.uid
						);
				}
				proposalsApplied += 1;
			}
			active?.handle
				.prepare(
					`INSERT INTO reconciliation_runs (
						source_commit, source_tree, reconciler_version,
						schema_version, started_at, completed_at, status,
						files_seen, files_changed, entities_created,
						entities_updated, entities_deleted, entities_quarantined,
						logical_digest, kind, error
					) VALUES (?, ?, 'q00024-s2', ?, ?, ?, 'ok', 0, 0, 0, ?, 0, 0, ?, 'promote', NULL)`
				)
				.run(
					input.sourceCommit,
					input.sourceCommit,
					active?.schemaVersion ?? 0,
					now,
					now,
					proposalsApplied,
					logicalDigest
				);
		});
		tx.immediate();
		return {
			status: 'ok',
			sourceCommit: input.sourceCommit,
			logicalDigest,
			proposalsApplied,
			integrity,
			foreignKeyViolations,
			failedStagingPath: null,
			reason: null,
		};
	} catch (error) {
		return {
			status: 'rejected',
			sourceCommit: input.sourceCommit,
			logicalDigest: null,
			proposalsApplied: 0,
			integrity: [],
			foreignKeyViolations: [],
			failedStagingPath: null,
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		staging?.close();
		active?.close();
	}
};
