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
	readonly plansApplied: number;
	readonly slicesApplied: number;
	/**
	 * x00539 S2 — how many entries the staging run left in quarantine.
	 * A promoted run can be `degraded`, so the count is always
	 * reported: `degraded` must never be silent.
	 */
	readonly quarantinedEntries: number;
	/** The staging run's own status: `ok` or `degraded` when promoted. */
	readonly stagingStatus: 'ok' | 'degraded' | 'failed' | null;
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

/**
 * Plans and slices cross the staging/active boundary by *uid*, never by
 * rowid: the two databases assign their own AUTOINCREMENT ids, so the
 * parent is resolved again on the active side.
 */
interface IPlanRow {
	readonly uid: string;
	readonly proposal_uid: string;
	readonly slug: string;
	readonly title: string;
	readonly source_path: string | null;
	readonly status: string;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
}

interface ISliceRow {
	readonly uid: string;
	readonly plan_uid: string;
	readonly slug: string;
	readonly title: string;
	readonly source_path: string | null;
	readonly status: string;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
}

interface IRunRow {
	readonly logical_digest: string | null;
	readonly status: 'ok' | 'degraded' | 'failed';
	readonly entities_quarantined: number | null;
}

const checkIntegrity = (driver: ProposalsSqliteDriver): readonly string[] =>
	driver.handle
		.query<{ readonly integrity_check: string }, []>(
			'PRAGMA integrity_check;',
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
				`${row.table}:${String(row.rowid)}->${row.parent}:${String(row.fkid)}`,
		);

const readStagingRun = (driver: ProposalsSqliteDriver): IRunRow | null =>
	driver.handle
		.query<IRunRow, []>(
			`SELECT logical_digest, status, entities_quarantined
			 FROM reconciliation_runs
			 WHERE kind = 'shadow'
			 ORDER BY id DESC
			 LIMIT 1`,
		)
		.get() ?? null;

const readProposals = (
	driver: ProposalsSqliteDriver,
): readonly IProposalRow[] =>
	driver.handle
		.query<IProposalRow, []>(
			`SELECT uid, slug, kind, status, title, source_path,
					source_blob_sha, revision, content_hash, created_at,
					updated_at, closed_at
			 FROM proposals
			 ORDER BY uid`,
		)
		.all();

const readPlans = (driver: ProposalsSqliteDriver): readonly IPlanRow[] =>
	driver.handle
		.query<IPlanRow, []>(
			`SELECT plans.uid AS uid,
					proposals.uid AS proposal_uid,
					plans.slug AS slug,
					plans.title AS title,
					plans.source_path AS source_path,
					plans.status AS status,
					plans.created_at AS created_at,
					plans.updated_at AS updated_at,
					plans.closed_at AS closed_at
			 FROM plans
			 JOIN proposals ON proposals.id = plans.proposal_id
			 ORDER BY plans.uid`,
		)
		.all();

const readSlices = (driver: ProposalsSqliteDriver): readonly ISliceRow[] =>
	driver.handle
		.query<ISliceRow, []>(
			`SELECT slices.uid AS uid,
					plans.uid AS plan_uid,
					slices.slug AS slug,
					slices.title AS title,
					slices.source_path AS source_path,
					slices.status AS status,
					slices.created_at AS created_at,
					slices.updated_at AS updated_at,
					slices.closed_at AS closed_at
			 FROM slices
			 JOIN plans ON plans.id = slices.plan_id
			 ORDER BY slices.uid`,
		)
		.all();

const preserveFailedStaging = (
	stagingPath: string,
	now: number,
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

const rejected = (
	input: IApplyValidatedCandidateInput,
	fields: {
		readonly logicalDigest?: string | null;
		readonly integrity?: readonly string[];
		readonly foreignKeyViolations?: readonly string[];
		readonly failedStagingPath?: string | null;
		readonly quarantinedEntries?: number;
		readonly stagingStatus?: 'ok' | 'degraded' | 'failed' | null;
		readonly reason: string;
	},
): IApplyValidatedCandidateResult => ({
	status: 'rejected',
	sourceCommit: input.sourceCommit,
	logicalDigest: fields.logicalDigest ?? null,
	proposalsApplied: 0,
	plansApplied: 0,
	slicesApplied: 0,
	quarantinedEntries: fields.quarantinedEntries ?? 0,
	stagingStatus: fields.stagingStatus ?? null,
	integrity: fields.integrity ?? [],
	foreignKeyViolations: fields.foreignKeyViolations ?? [],
	failedStagingPath: fields.failedStagingPath ?? null,
	reason: fields.reason,
});

export const applyValidatedCandidate = (
	input: IApplyValidatedCandidateInput,
): IApplyValidatedCandidateResult => {
	if (!existsSync(input.stagingPath)) {
		return rejected(input, {
			reason: `staging database not found: ${input.stagingPath}`,
		});
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
		const quarantinedEntries = stagingRun?.entities_quarantined ?? 0;
		const stagingStatus = stagingRun?.status ?? null;
		const now = input.now ?? Date.now();
		// x00539 S2 — `degraded` is PROMOTABLE. Quarantine exists so a
		// corrupt entry is not lost (f00515); requiring `ok` turned it
		// into a total block, and the six README.md files under the
		// proposals tree were enough to make every run from this
		// repository unpromotable. What blocks promotion is a run that
		// actually `failed`, a broken integrity_check or
		// foreign_key_check, or a digest that does not match.
		if (
			stagingRun === null ||
			stagingRun.status === 'failed' ||
			integrity.length !== 1 ||
			integrity[0] !== 'ok' ||
			foreignKeyViolations.length > 0 ||
			(input.expectedDigest !== undefined &&
				logicalDigest !== input.expectedDigest)
		) {
			const reason =
				stagingRun === null
					? 'staging has no completed shadow reconciliation'
					: stagingRun.status === 'failed'
						? 'staging reconciliation status is failed'
						: integrity[0] !== 'ok'
							? 'staging integrity_check failed'
							: foreignKeyViolations.length > 0
								? 'staging foreign_key_check failed'
								: 'staging logical digest does not match expected digest';
			staging.close();
			staging = null;
			const failedStagingPath = preserveFailedStaging(
				input.stagingPath,
				now,
			);
			return rejected(input, {
				logicalDigest,
				integrity,
				foreignKeyViolations,
				failedStagingPath,
				quarantinedEntries,
				stagingStatus,
				reason,
			});
		}

		const proposals = readProposals(staging);
		const plans = readPlans(staging);
		const slices = readSlices(staging);
		staging.close();
		staging = null;

		active = new ProposalsSqliteDriver({ path: input.activePath });
		const handle = active.handle;
		const schemaVersion = active.schemaVersion;
		let proposalsApplied = 0;
		let plansApplied = 0;
		let slicesApplied = 0;

		// One IMMEDIATE transaction for the three Git-derived tables. The
		// operational ledgers (lifecycle_events, outbox, mutation_commands,
		// quarantine) are never touched here: they are not derived from
		// Git and must survive a rebuild.
		const tx = handle.transaction(() => {
			proposalsApplied = 0;
			plansApplied = 0;
			slicesApplied = 0;
			for (const proposal of proposals) {
				const current = handle
					.query<{ readonly id: number }, [string]>(
						'SELECT id FROM proposals WHERE uid = ?',
					)
					.get(proposal.uid);
				if (current === null) {
					handle
						.prepare(
							`INSERT INTO proposals (
								uid, slug, kind, status, title, source_path,
								source_blob_sha, revision, content_hash,
								created_at, updated_at, closed_at
							) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
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
							proposal.closed_at,
						);
				} else {
					handle
						.prepare(
							`UPDATE proposals
							 SET slug = ?, kind = ?, status = ?, title = ?,
								 source_path = ?, source_blob_sha = ?,
								 content_hash = ?, revision = revision + 1,
								 updated_at = ?, closed_at = ?
							 WHERE uid = ?`,
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
							proposal.uid,
						);
				}
				proposalsApplied += 1;
			}

			for (const plan of plans) {
				const parent = handle
					.query<{ readonly id: number }, [string]>(
						'SELECT id FROM proposals WHERE uid = ?',
					)
					.get(plan.proposal_uid);
				if (parent === null) {
					throw new Error(
						`plan ${plan.uid} references unknown proposal ${plan.proposal_uid}`,
					);
				}
				const current = handle
					.query<{ readonly id: number }, [string]>(
						'SELECT id FROM plans WHERE uid = ?',
					)
					.get(plan.uid);
				if (current === null) {
					handle
						.prepare(
							`INSERT INTO plans (
								uid, proposal_id, slug, title, source_path,
								revision, created_at, updated_at, closed_at, status
							) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
						)
						.run(
							plan.uid,
							parent.id,
							plan.slug,
							plan.title,
							plan.source_path,
							plan.created_at,
							plan.updated_at,
							plan.closed_at,
							plan.status,
						);
				} else {
					handle
						.prepare(
							`UPDATE plans
							 SET proposal_id = ?, slug = ?, title = ?,
								 source_path = ?, status = ?,
								 revision = revision + 1,
								 updated_at = ?, closed_at = ?
							 WHERE uid = ?`,
						)
						.run(
							parent.id,
							plan.slug,
							plan.title,
							plan.source_path,
							plan.status,
							now,
							plan.closed_at,
							plan.uid,
						);
				}
				plansApplied += 1;
			}

			for (const slice of slices) {
				const parent = handle
					.query<{ readonly id: number }, [string]>(
						'SELECT id FROM plans WHERE uid = ?',
					)
					.get(slice.plan_uid);
				if (parent === null) {
					throw new Error(
						`slice ${slice.uid} references unknown plan ${slice.plan_uid}`,
					);
				}
				const current = handle
					.query<{ readonly id: number }, [string]>(
						'SELECT id FROM slices WHERE uid = ?',
					)
					.get(slice.uid);
				if (current === null) {
					handle
						.prepare(
							`INSERT INTO slices (
								uid, plan_id, slug, title, source_path,
								revision, created_at, updated_at, closed_at, status
							) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
						)
						.run(
							slice.uid,
							parent.id,
							slice.slug,
							slice.title,
							slice.source_path,
							slice.created_at,
							slice.updated_at,
							slice.closed_at,
							slice.status,
						);
				} else {
					handle
						.prepare(
							`UPDATE slices
							 SET plan_id = ?, slug = ?, title = ?,
								 source_path = ?, status = ?,
								 revision = revision + 1,
								 updated_at = ?, closed_at = ?
							 WHERE uid = ?`,
						)
						.run(
							parent.id,
							slice.slug,
							slice.title,
							slice.source_path,
							slice.status,
							now,
							slice.closed_at,
							slice.uid,
						);
				}
				slicesApplied += 1;
			}

			handle
				.prepare(
					`INSERT INTO reconciliation_runs (
						source_commit, source_tree, reconciler_version,
						schema_version, started_at, completed_at, status,
						files_seen, files_changed, entities_created,
						entities_updated, entities_deleted, entities_quarantined,
						logical_digest, kind, error
					) VALUES (?, ?, 'x00539-s2', ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, ?, 'promote', NULL)`,
				)
				.run(
					input.sourceCommit,
					input.sourceCommit,
					schemaVersion,
					now,
					now,
					// x00539 S2 — the promote row inherits the staging
					// run's status and its quarantine count, so a
					// `degraded` promotion is visible in the ledger
					// instead of being recorded as a clean `ok`.
					stagingStatus === 'degraded' ? 'degraded' : 'ok',
					proposalsApplied + plansApplied + slicesApplied,
					quarantinedEntries,
					logicalDigest,
				);
		});
		tx.immediate();
		return {
			status: 'ok',
			sourceCommit: input.sourceCommit,
			logicalDigest,
			proposalsApplied,
			plansApplied,
			slicesApplied,
			quarantinedEntries,
			stagingStatus:
				stagingStatus === 'failed' || stagingStatus === null
					? null
					: stagingStatus,
			integrity,
			foreignKeyViolations,
			failedStagingPath: null,
			reason: null,
		};
	} catch (error) {
		return rejected(input, {
			reason: error instanceof Error ? error.message : String(error),
		});
	} finally {
		staging?.close();
		active?.close();
	}
};
