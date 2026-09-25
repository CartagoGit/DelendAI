import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

import { ProposalsSqliteDriver } from './sqlite-driver';

export interface IApplyValidatedCandidateInput {
	readonly stagingPath: string;
	readonly activePath: string;
	readonly sourceCommit: string;
	readonly expectedDigest?: string;
	/**
	 * The active database's authority as the CALLER observed it before
	 * building this staging copy — the `source_commit` of the newest
	 * promoted run, or `null` when the database had never been promoted.
	 *
	 * A staging database is built from a snapshot of the repository and
	 * promoted some time later. Between those two moments another
	 * reconciliation can promote a NEWER source commit, and promoting
	 * this one afterwards silently replaces newer authority with older:
	 * both runs succeed, neither reports a conflict, and the database
	 * ends up describing a commit that is no longer the latest. That is
	 * the same lost-update this project refuses everywhere else, and it
	 * was the one place still deciding by arrival order.
	 *
	 * Supplying it makes promotion a compare-and-swap. Omitting it keeps
	 * the previous behaviour, so existing callers are unchanged — but a
	 * caller that can observe the active state and does not pass it is
	 * choosing last-writer-wins, which this field exists to let it stop
	 * doing.
	 */
	readonly expectedActiveSourceCommit?: string | null;
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
	 * Disappearances carried from staging into the active database.
	 *
	 * Reported rather than inferred: an entity whose file has gone is a
	 * decision the reconciliation made, and a caller that cannot see the
	 * count cannot tell a quiet promotion from one that retired work.
	 */
	readonly tombstonesApplied: number;
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
	readonly track: string | null;
	readonly type: string | null;
	readonly proposal_date: string | null;
	readonly frontmatter_json: string | null;
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

interface IQuarantineRow {
	readonly source_path: string;
	readonly blob_sha: string;
	readonly entity_guess: string | null;
	readonly error_code: string;
	readonly error_message: string;
	readonly raw_metadata: string | null;
	readonly status: string;
	readonly created_at: number;
	readonly updated_at: number;
	readonly resolved_at: number | null;
	readonly resolved_by: string | null;
	readonly resolution_note: string | null;
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
					updated_at, closed_at, track, type, proposal_date,
					frontmatter_json
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

const readQuarantine = (
	driver: ProposalsSqliteDriver,
): readonly IQuarantineRow[] =>
	driver.handle
		.query<IQuarantineRow, []>(
			`SELECT source_path, blob_sha, entity_guess,
					error_code, error_message, raw_metadata, status,
					created_at, updated_at, resolved_at, resolved_by,
					resolution_note
			 FROM quarantine
			 ORDER BY id`,
		)
		.all();

interface ITombstoneRow {
	readonly entity_type: string;
	readonly entity_uid: string;
	readonly reason: string;
	readonly deleted_at: number;
	readonly last_seen_at: number;
	readonly last_seen_commit: string;
}

/**
 * Disappearances the staging run classified.
 *
 * `reconcileTombstones` compares the active database against the paths
 * the commit actually carries, decides whether an absence is a removal,
 * a rename or a reorganisation, and records that INTO the staging copy.
 * Promotion then carried proposals, plans, slices and quarantine — and
 * left these behind, so an entity whose file had gone stayed alive in
 * the active database with nothing saying otherwise. The classification
 * was made and then dropped on the floor.
 */
const readTombstones = (
	driver: ProposalsSqliteDriver,
): readonly ITombstoneRow[] =>
	driver.handle
		.query<ITombstoneRow, []>(
			`SELECT entity_type, entity_uid, reason,
					deleted_at, last_seen_at, last_seen_commit
			 FROM tombstones
			 ORDER BY id`,
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
	tombstonesApplied: 0,
	quarantinedEntries: fields.quarantinedEntries ?? 0,
	stagingStatus: fields.stagingStatus ?? null,
	integrity: fields.integrity ?? [],
	foreignKeyViolations: fields.foreignKeyViolations ?? [],
	failedStagingPath: fields.failedStagingPath ?? null,
	reason: fields.reason,
});

/**
 * The `source_commit` of the newest run the active database has
 * ACCEPTED, or `null` when it holds none.
 *
 * Every run row an active database carries describes a write to it:
 * `apply_candidate` (a staging copy applied), `incremental` (the files a change
 * touched, applied directly), and — for a database created by renaming
 * a staging file into place, which is how a full rebuild lands — the
 * `shadow` run that built it. So the newest row, whatever its kind, is
 * the authority.
 *
 * It deliberately does NOT filter on the apply kind (`apply_candidate`,
 * `promote` before 0022), which is what it did when the fence was introduced. An incremental pass advances the
 * active database without promoting anything, so a fence that only saw
 * promotions would let a staging copy built BEFORE that pass overwrite
 * it and report success — the very lost update the fence exists to
 * refuse, reachable through the mode r00055 added in the same slice.
 *
 * Read INSIDE the promotion transaction, so the answer cannot change
 * between the check and the write — a check taken outside would be the
 * classic time-of-check/time-of-use hole.
 */
const activeAuthority = (handle: {
	prepare: (sql: string) => { get: () => unknown };
}): string | null => {
	const row = handle
		.prepare(
			`SELECT source_commit FROM reconciliation_runs
			 ORDER BY id DESC LIMIT 1`,
		)
		.get() as { readonly source_commit?: string } | undefined;
	return row?.source_commit ?? null;
};

/**
 * The same answer, for a caller that has to know it BEFORE it starts
 * building a staging copy — the only moment at which it can pass a
 * meaningful `expectedActiveSourceCommit`.
 *
 * Opening the database here is a read: the value is a snapshot, and the
 * promotion re-reads it inside its own transaction before writing. This
 * is what lets a caller say "I built this from what I saw" without
 * turning the observation itself into a race.
 */
export const readActiveAuthority = (activePath: string): string | null => {
	if (!existsSync(activePath)) return null;
	const driver = new ProposalsSqliteDriver({ path: activePath });
	try {
		return activeAuthority(driver.handle);
	} finally {
		driver.close();
	}
};

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
		// S2 — `degraded` is PROMOTABLE. Quarantine exists so a
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
		const quarantine = readQuarantine(staging);
		const tombstones = readTombstones(staging);
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
		// The fence, read inside the transaction it protects. A check
		// taken outside would answer about a database that can change
		// before the write lands.
		let fencedOff: string | null | undefined;
		const tx = handle.transaction(() => {
			if (input.expectedActiveSourceCommit !== undefined) {
				const seen = activeAuthority(handle);
				if (seen !== input.expectedActiveSourceCommit) {
					fencedOff = seen;
					return;
				}
			}
			proposalsApplied = 0;
			plansApplied = 0;
			slicesApplied = 0;
			const promotionRun = handle
				.prepare(
					`INSERT INTO reconciliation_runs (
						source_commit, source_tree, reconciler_version,
						schema_version, started_at, completed_at, status,
						files_seen, files_changed, entities_created,
						entities_updated, entities_deleted, entities_quarantined,
						logical_digest, kind, error
					) VALUES (?, ?, 'x00539-s2', ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, 'apply_candidate', NULL)`,
				)
				.run(
					input.sourceCommit,
					input.sourceCommit,
					schemaVersion,
					now,
					now,
					stagingStatus === 'degraded' ? 'degraded' : 'ok',
					quarantinedEntries,
					logicalDigest,
				);
			const promotionRunId = Number(promotionRun.lastInsertRowid);
			for (const entry of quarantine) {
				handle
					.prepare(
						`INSERT INTO quarantine (
							source_path, blob_sha, entity_guess,
							error_code, error_message, raw_metadata,
							run_id, status, created_at, updated_at,
							resolved_at, resolved_by, resolution_note
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					)
					.run(
						entry.source_path,
						entry.blob_sha,
						entry.entity_guess,
						entry.error_code,
						entry.error_message,
						entry.raw_metadata,
						promotionRunId,
						entry.status,
						entry.created_at,
						entry.updated_at,
						entry.resolved_at,
						entry.resolved_by,
						entry.resolution_note,
					);
			}
			// Carry the classifications forward, and mark the entity they
			// describe. Without the second half a tombstone row would
			// exist while the proposal it refers to still reads as live,
			// which is a record of a decision nobody acted on.
			for (const stone of tombstones) {
				handle
					.prepare(
						`INSERT INTO tombstones (
							entity_type, entity_uid, reason,
							deleted_at, last_seen_at, last_seen_commit
						) VALUES (?, ?, ?, ?, ?, ?)`,
					)
					.run(
						stone.entity_type,
						stone.entity_uid,
						stone.reason,
						stone.deleted_at,
						stone.last_seen_at,
						stone.last_seen_commit,
					);
				const table =
					stone.entity_type === 'proposal'
						? 'proposals'
						: stone.entity_type === 'plan'
							? 'plans'
							: 'slices';
				handle
					.prepare(
						`UPDATE ${table}
						 SET deleted_at = ?, last_seen_at = ?,
							 last_seen_commit = ?, tombstone_reason = ?
						 WHERE uid = ?`,
					)
					.run(
						stone.deleted_at,
						stone.last_seen_at,
						stone.last_seen_commit,
						stone.reason,
						stone.entity_uid,
					);
			}

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
								created_at, updated_at, closed_at,
								track, type, proposal_date, frontmatter_json
							) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
							proposal.track,
							proposal.type,
							proposal.proposal_date,
							proposal.frontmatter_json,
						);
				} else {
					handle
						.prepare(
							`UPDATE proposals
							 SET slug = ?, kind = ?, status = ?, title = ?,
								 source_path = ?, source_blob_sha = ?,
								 content_hash = ?, revision = revision + 1,
								 updated_at = ?, closed_at = ?,
								 track = ?, type = ?, proposal_date = ?,
								 frontmatter_json = ?
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
							proposal.track,
							proposal.type,
							proposal.proposal_date,
							proposal.frontmatter_json,
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
		});
		tx.immediate();
		if (fencedOff !== undefined) {
			// Nothing was written: the transaction returned before its
			// first statement. The staging copy is preserved, because it
			// is not wrong — it is merely built on an authority that has
			// since moved, and rebuilding it from the newer one is the
			// caller's next step rather than a loss.
			return rejected(input, {
				logicalDigest,
				integrity,
				foreignKeyViolations,
				quarantinedEntries,
				stagingStatus,
				reason: `active database has moved: expected its newest promotion to be ${input.expectedActiveSourceCommit ?? 'none'}, found ${fencedOff ?? 'none'}. Nothing was written; rebuild the staging copy against the current authority.`,
			});
		}
		return {
			status: 'ok',
			sourceCommit: input.sourceCommit,
			logicalDigest,
			proposalsApplied,
			plansApplied,
			slicesApplied,
			tombstonesApplied: tombstones.length,
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
