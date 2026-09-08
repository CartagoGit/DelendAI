import { existsSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';

import type { Database } from 'bun:sqlite';

import { ProposalsSqliteDriver } from './sqlite-driver';

export type TTombstoneReason =
	| 'git-removed'
	| 'renamed'
	| 'moved-by-reorg'
	| 'unknown';

export interface IClassifyDisappearanceInput {
	readonly previousPath: string | null;
	readonly currentPaths: readonly string[];
}

export interface IClassifyDisappearanceOutput {
	readonly reason: TTombstoneReason;
	readonly replacementPath: string | null;
}

export interface IReconcileTombstonesInput {
	readonly activeDatabasePath: string;
	readonly staging: Database;
	readonly currentPaths: readonly string[];
	readonly sourceCommit: string;
	readonly now: number;
}

export interface IReconcileTombstonesOutput {
	readonly relocated: number;
	readonly tombstoned: number;
}

interface ILatestRunRow {
	readonly source_commit: string | null;
	readonly completed_at: number | null;
}

interface IBaseEntityRow {
	readonly uid: string;
	readonly slug: string;
	readonly title: string;
	readonly source_path: string | null;
	readonly revision: number;
	readonly created_at: number;
	readonly updated_at: number;
	readonly closed_at: number | null;
	readonly deleted_at: number | null;
	readonly last_seen_at: number | null;
	readonly last_seen_commit: string | null;
	readonly tombstone_reason: string | null;
	readonly status: string;
}

interface IProposalRow extends IBaseEntityRow {
	readonly kind: string;
	readonly source_blob_sha: string | null;
	readonly content_hash: string | null;
}

interface IPlanRow extends IBaseEntityRow {
	readonly proposal_uid: string;
}

interface ISliceRow extends IBaseEntityRow {
	readonly plan_uid: string;
}

interface IPathHistoryRow {
	readonly entity_type: 'proposal' | 'plan' | 'slice';
	readonly entity_uid: string;
	readonly from_path: string;
	readonly to_path: string;
	readonly changed_at: number;
	readonly source_commit: string;
}

interface ITombstoneRow {
	readonly entity_type: 'proposal' | 'plan' | 'slice';
	readonly entity_uid: string;
	readonly reason: TTombstoneReason;
	readonly deleted_at: number;
	readonly last_seen_at: number;
	readonly last_seen_commit: string;
}

const stemOf = (path: string): string => {
	const base = basename(path);
	const extension = extname(base);
	return extension === '' ? base : base.slice(0, -extension.length);
};

const classifyUniqueMatch = (
	paths: readonly string[],
	predicate: (path: string) => boolean,
): string | null | 'ambiguous' => {
	const matches = paths.filter(predicate);
	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0] ?? null;
	return 'ambiguous';
};

export const classifyDisappearance = (
	input: IClassifyDisappearanceInput,
): IClassifyDisappearanceOutput => {
	const previousPath = input.previousPath?.trim() ?? '';
	if (previousPath === '') {
		return { reason: 'unknown', replacementPath: null };
	}
	if (input.currentPaths.includes(previousPath)) {
		return { reason: 'unknown', replacementPath: null };
	}

	const currentPaths = input.currentPaths.filter(
		(path) => path !== previousPath,
	);
	const previousDir = dirname(previousPath);
	const previousBase = basename(previousPath);
	const previousStem = stemOf(previousPath);

	const sameBasename = classifyUniqueMatch(
		currentPaths,
		(path) => basename(path) === previousBase,
	);
	if (sameBasename === 'ambiguous') {
		return { reason: 'unknown', replacementPath: null };
	}
	if (sameBasename !== null) {
		return { reason: 'renamed', replacementPath: sameBasename };
	}

	const sameDirectory = classifyUniqueMatch(
		currentPaths,
		(path) => dirname(path) === previousDir,
	);
	if (sameDirectory !== 'ambiguous' && sameDirectory !== null) {
		return { reason: 'moved-by-reorg', replacementPath: sameDirectory };
	}

	const sameStem = classifyUniqueMatch(
		currentPaths,
		(path) => stemOf(path) === previousStem,
	);
	if (sameStem === 'ambiguous' || sameDirectory === 'ambiguous') {
		return { reason: 'unknown', replacementPath: null };
	}
	if (sameStem !== null) {
		return { reason: 'moved-by-reorg', replacementPath: sameStem };
	}

	return { reason: 'git-removed', replacementPath: null };
};

const latestRun = (db: Database): ILatestRunRow | null =>
	db
		.query<ILatestRunRow, []>(
			`SELECT source_commit, completed_at
			 FROM reconciliation_runs
			 WHERE completed_at IS NOT NULL
			 ORDER BY completed_at DESC, id DESC
			 LIMIT 1`,
		)
		.get();

const readProposals = (db: Database): readonly IProposalRow[] =>
	db
		.query<IProposalRow, []>(
			`SELECT uid, slug, title, source_path, revision, created_at,
					updated_at, closed_at, deleted_at, last_seen_at,
					last_seen_commit, tombstone_reason, status, kind,
					source_blob_sha, content_hash
			 FROM proposals
			 ORDER BY uid ASC`,
		)
		.all();

const readPlans = (db: Database): readonly IPlanRow[] =>
	db
		.query<IPlanRow, []>(
			`SELECT plans.uid AS uid, plans.slug AS slug, plans.title AS title,
					plans.source_path AS source_path,
					plans.revision AS revision,
					plans.created_at AS created_at,
					plans.updated_at AS updated_at,
					plans.closed_at AS closed_at,
					plans.deleted_at AS deleted_at,
					plans.last_seen_at AS last_seen_at,
					plans.last_seen_commit AS last_seen_commit,
					plans.tombstone_reason AS tombstone_reason,
					plans.status AS status,
					proposals.uid AS proposal_uid
			 FROM plans
			 JOIN proposals ON proposals.id = plans.proposal_id
			 ORDER BY plans.uid ASC`,
		)
		.all();

const readSlices = (db: Database): readonly ISliceRow[] =>
	db
		.query<ISliceRow, []>(
			`SELECT slices.uid AS uid, slices.slug AS slug,
					slices.title AS title, slices.source_path AS source_path,
					slices.revision AS revision,
					slices.created_at AS created_at,
					slices.updated_at AS updated_at,
					slices.closed_at AS closed_at,
					slices.deleted_at AS deleted_at,
					slices.last_seen_at AS last_seen_at,
					slices.last_seen_commit AS last_seen_commit,
					slices.tombstone_reason AS tombstone_reason,
					slices.status AS status,
					plans.uid AS plan_uid
			 FROM slices
			 JOIN plans ON plans.id = slices.plan_id
			 ORDER BY slices.uid ASC`,
		)
		.all();

const readPathHistory = (db: Database): readonly IPathHistoryRow[] =>
	db
		.query<IPathHistoryRow, []>(
			`SELECT entity_type, entity_uid, from_path, to_path,
					changed_at, source_commit
			 FROM path_history
			 ORDER BY id ASC`,
		)
		.all();

const readTombstones = (db: Database): readonly ITombstoneRow[] =>
	db
		.query<ITombstoneRow, []>(
			`SELECT entity_type, entity_uid, reason, deleted_at,
					last_seen_at, last_seen_commit
			 FROM tombstones
			 ORDER BY id ASC`,
		)
		.all();

const readIdByUid = (
	db: Database,
	table: 'proposals' | 'plans',
	uid: string,
): number | null => {
	const row = db
		.query<{ id: number }, [string]>(
			`SELECT id FROM ${table} WHERE uid = ?`,
		)
		.get(uid);
	return row?.id ?? null;
};

const readProjected = (
	db: Database,
	table: 'proposals' | 'plans' | 'slices',
	uid: string,
): { uid: string; source_path: string | null } | null =>
	db
		.query<{ uid: string; source_path: string | null }, [string]>(
			`SELECT uid, source_path FROM ${table} WHERE uid = ?`,
		)
		.get(uid);

const readUidBySourcePath = (
	db: Database,
	table: 'proposals' | 'plans' | 'slices',
	sourcePath: string,
): string | null => {
	const row = db
		.query<{ uid: string }, [string]>(
			`SELECT uid FROM ${table} WHERE source_path = ? LIMIT 1`,
		)
		.get(sourcePath);
	return row?.uid ?? null;
};

const insertPathHistory = (
	db: Database,
	row: IPathHistoryRow,
): void => {
	db.prepare(
		`INSERT OR IGNORE INTO path_history (
			entity_type, entity_uid, from_path, to_path, changed_at, source_commit
		) VALUES (?, ?, ?, ?, ?, ?)`,
	).run(
		row.entity_type,
		row.entity_uid,
		row.from_path,
		row.to_path,
		row.changed_at,
		row.source_commit,
	);
};

const insertTombstone = (db: Database, row: ITombstoneRow): void => {
	db.prepare(
		`INSERT OR IGNORE INTO tombstones (
			entity_type, entity_uid, reason, deleted_at, last_seen_at,
			last_seen_commit
		) VALUES (?, ?, ?, ?, ?, ?)`,
	).run(
		row.entity_type,
		row.entity_uid,
		row.reason,
		row.deleted_at,
		row.last_seen_at,
		row.last_seen_commit,
	);
};

const insertProposal = (
	db: Database,
	row: IProposalRow,
	overrides: {
		readonly sourcePath: string | null;
		readonly revision: number;
		readonly updatedAt: number;
		readonly deletedAt: number | null;
		readonly lastSeenAt: number | null;
		readonly lastSeenCommit: string | null;
		readonly tombstoneReason: string | null;
	},
): void => {
	db.prepare(
		`INSERT INTO proposals (
			uid, slug, kind, status, title, source_path, source_blob_sha,
			revision, content_hash, created_at, updated_at, closed_at,
			deleted_at, last_seen_at, last_seen_commit, tombstone_reason
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		row.uid,
		row.slug,
		row.kind,
		row.status,
		row.title,
		overrides.sourcePath,
		row.source_blob_sha,
		overrides.revision,
		row.content_hash,
		row.created_at,
		overrides.updatedAt,
		row.closed_at,
		overrides.deletedAt,
		overrides.lastSeenAt,
		overrides.lastSeenCommit,
		overrides.tombstoneReason,
	);
};

const insertPlan = (
	db: Database,
	row: IPlanRow,
	proposalId: number,
	overrides: {
		readonly sourcePath: string | null;
		readonly revision: number;
		readonly updatedAt: number;
		readonly deletedAt: number | null;
		readonly lastSeenAt: number | null;
		readonly lastSeenCommit: string | null;
		readonly tombstoneReason: string | null;
	},
): void => {
	db.prepare(
		`INSERT INTO plans (
			uid, proposal_id, slug, title, source_path, revision,
			created_at, updated_at, closed_at, deleted_at, last_seen_at,
			last_seen_commit, tombstone_reason, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		row.uid,
		proposalId,
		row.slug,
		row.title,
		overrides.sourcePath,
		overrides.revision,
		row.created_at,
		overrides.updatedAt,
		row.closed_at,
		overrides.deletedAt,
		overrides.lastSeenAt,
		overrides.lastSeenCommit,
		overrides.tombstoneReason,
		row.status,
	);
};

const insertSlice = (
	db: Database,
	row: ISliceRow,
	planId: number,
	overrides: {
		readonly sourcePath: string | null;
		readonly revision: number;
		readonly updatedAt: number;
		readonly deletedAt: number | null;
		readonly lastSeenAt: number | null;
		readonly lastSeenCommit: string | null;
		readonly tombstoneReason: string | null;
	},
): void => {
	db.prepare(
		`INSERT INTO slices (
			uid, plan_id, slug, title, source_path, revision,
			created_at, updated_at, closed_at, deleted_at, last_seen_at,
			last_seen_commit, tombstone_reason, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		row.uid,
		planId,
		row.slug,
		row.title,
		overrides.sourcePath,
		overrides.revision,
		row.created_at,
		overrides.updatedAt,
		row.closed_at,
		overrides.deletedAt,
		overrides.lastSeenAt,
		overrides.lastSeenCommit,
		overrides.tombstoneReason,
		row.status,
	);
};

const carryForwardHistory = (
	active: Database,
	staging: Database,
): void => {
	for (const row of readPathHistory(active)) {
		insertPathHistory(staging, row);
	}
	for (const row of readTombstones(active)) {
		insertTombstone(staging, row);
	}
};

const pathChanged = (
	previousPath: string | null,
	nextPath: string | null,
): previousPath is string =>
	typeof previousPath === 'string' &&
	previousPath !== '' &&
	typeof nextPath === 'string' &&
	nextPath !== '' &&
	previousPath !== nextPath;

const resolveLastSeen = (
	row: IBaseEntityRow,
	run: ILatestRunRow | null,
	fallbackCommit: string,
): { readonly lastSeenAt: number; readonly lastSeenCommit: string } => ({
	lastSeenAt: row.last_seen_at ?? run?.completed_at ?? row.updated_at,
	lastSeenCommit:
		row.last_seen_commit ?? run?.source_commit ?? fallbackCommit,
});

export const reconcileTombstones = (
	input: IReconcileTombstonesInput,
): IReconcileTombstonesOutput => {
	if (!existsSync(input.activeDatabasePath)) {
		return { relocated: 0, tombstoned: 0 };
	}

	const active = new ProposalsSqliteDriver({
		path: input.activeDatabasePath,
		readonly: true,
	});
	try {
		const write = input.staging.transaction(() => {
			let relocated = 0;
			let tombstoned = 0;
			const currentPaths = [...new Set(input.currentPaths)];
			const run = latestRun(active.handle);

			carryForwardHistory(active.handle, input.staging);

			for (const row of readProposals(active.handle)) {
				const projected = readProjected(input.staging, 'proposals', row.uid);
				if (projected !== null) {
					const nextPath = projected.source_path;
					if (
						row.source_path !== null &&
						nextPath !== null &&
						row.source_path !== nextPath
					) {
						insertPathHistory(input.staging, {
							entity_type: 'proposal',
							entity_uid: row.uid,
							from_path: row.source_path,
							to_path: nextPath,
							changed_at: input.now,
							source_commit: input.sourceCommit,
						});
					}
					continue;
				}
				if (row.deleted_at !== null) {
					insertProposal(input.staging, row, {
						sourcePath: row.source_path,
						revision: row.revision,
						updatedAt: row.updated_at,
						deletedAt: row.deleted_at,
						lastSeenAt: row.last_seen_at,
						lastSeenCommit: row.last_seen_commit,
						tombstoneReason: row.tombstone_reason,
					});
					continue;
				}
				const classification = classifyDisappearance({
					previousPath: row.source_path,
					currentPaths,
				});
				const conflictingUid =
					classification.replacementPath === null
						? null
						: readUidBySourcePath(
								input.staging,
								'proposals',
								classification.replacementPath,
							);
				if (
					classification.replacementPath !== null &&
					conflictingUid === null
				) {
					insertProposal(input.staging, row, {
						sourcePath: classification.replacementPath,
						revision: row.revision + 1,
						updatedAt: input.now,
						deletedAt: null,
						lastSeenAt: null,
						lastSeenCommit: null,
						tombstoneReason: null,
					});
					if (pathChanged(row.source_path, classification.replacementPath)) {
						insertPathHistory(input.staging, {
							entity_type: 'proposal',
							entity_uid: row.uid,
							from_path: row.source_path,
							to_path: classification.replacementPath,
							changed_at: input.now,
							source_commit: input.sourceCommit,
						});
					}
					relocated += 1;
					continue;
				}
				const lastSeen = resolveLastSeen(row, run, input.sourceCommit);
				insertProposal(input.staging, row, {
					sourcePath: row.source_path,
					revision: row.revision + 1,
					updatedAt: input.now,
					deletedAt: input.now,
					lastSeenAt: lastSeen.lastSeenAt,
					lastSeenCommit: lastSeen.lastSeenCommit,
					tombstoneReason:
						classification.replacementPath !== null ? 'unknown' : classification.reason,
				});
				insertTombstone(input.staging, {
					entity_type: 'proposal',
					entity_uid: row.uid,
					reason:
						classification.replacementPath !== null ? 'unknown' : classification.reason,
					deleted_at: input.now,
					last_seen_at: lastSeen.lastSeenAt,
					last_seen_commit: lastSeen.lastSeenCommit,
				});
				tombstoned += 1;
			}

			for (const row of readPlans(active.handle)) {
				const projected = readProjected(input.staging, 'plans', row.uid);
				if (projected !== null) {
					const nextPath = projected.source_path;
					if (
						row.source_path !== null &&
						nextPath !== null &&
						row.source_path !== nextPath
					) {
						insertPathHistory(input.staging, {
							entity_type: 'plan',
							entity_uid: row.uid,
							from_path: row.source_path,
							to_path: nextPath,
							changed_at: input.now,
							source_commit: input.sourceCommit,
						});
					}
					continue;
				}
				const proposalId = readIdByUid(
					input.staging,
					'proposals',
					row.proposal_uid,
				);
				if (proposalId === null) continue;
				if (row.deleted_at !== null) {
					insertPlan(input.staging, row, proposalId, {
						sourcePath: row.source_path,
						revision: row.revision,
						updatedAt: row.updated_at,
						deletedAt: row.deleted_at,
						lastSeenAt: row.last_seen_at,
						lastSeenCommit: row.last_seen_commit,
						tombstoneReason: row.tombstone_reason,
					});
					continue;
				}
				const classification = classifyDisappearance({
					previousPath: row.source_path,
					currentPaths,
				});
				const conflictingUid =
					classification.replacementPath === null
						? null
						: readUidBySourcePath(input.staging, 'plans', classification.replacementPath);
				if (
					classification.replacementPath !== null &&
					conflictingUid === null
				) {
					insertPlan(input.staging, row, proposalId, {
						sourcePath: classification.replacementPath,
						revision: row.revision + 1,
						updatedAt: input.now,
						deletedAt: null,
						lastSeenAt: null,
						lastSeenCommit: null,
						tombstoneReason: null,
					});
					if (pathChanged(row.source_path, classification.replacementPath)) {
						insertPathHistory(input.staging, {
							entity_type: 'plan',
							entity_uid: row.uid,
							from_path: row.source_path,
							to_path: classification.replacementPath,
							changed_at: input.now,
							source_commit: input.sourceCommit,
						});
					}
					relocated += 1;
					continue;
				}
				const lastSeen = resolveLastSeen(row, run, input.sourceCommit);
				insertPlan(input.staging, row, proposalId, {
					sourcePath: row.source_path,
					revision: row.revision + 1,
					updatedAt: input.now,
					deletedAt: input.now,
					lastSeenAt: lastSeen.lastSeenAt,
					lastSeenCommit: lastSeen.lastSeenCommit,
					tombstoneReason:
						classification.replacementPath !== null ? 'unknown' : classification.reason,
				});
				insertTombstone(input.staging, {
					entity_type: 'plan',
					entity_uid: row.uid,
					reason:
						classification.replacementPath !== null ? 'unknown' : classification.reason,
					deleted_at: input.now,
					last_seen_at: lastSeen.lastSeenAt,
					last_seen_commit: lastSeen.lastSeenCommit,
				});
				tombstoned += 1;
			}

			for (const row of readSlices(active.handle)) {
				const projected = readProjected(input.staging, 'slices', row.uid);
				if (projected !== null) {
					const nextPath = projected.source_path;
					if (
						row.source_path !== null &&
						nextPath !== null &&
						row.source_path !== nextPath
					) {
						insertPathHistory(input.staging, {
							entity_type: 'slice',
							entity_uid: row.uid,
							from_path: row.source_path,
							to_path: nextPath,
							changed_at: input.now,
							source_commit: input.sourceCommit,
						});
					}
					continue;
				}
				const planId = readIdByUid(input.staging, 'plans', row.plan_uid);
				if (planId === null) continue;
				if (row.deleted_at !== null) {
					insertSlice(input.staging, row, planId, {
						sourcePath: row.source_path,
						revision: row.revision,
						updatedAt: row.updated_at,
						deletedAt: row.deleted_at,
						lastSeenAt: row.last_seen_at,
						lastSeenCommit: row.last_seen_commit,
						tombstoneReason: row.tombstone_reason,
					});
					continue;
				}
				const classification = classifyDisappearance({
					previousPath: row.source_path,
					currentPaths,
				});
				const conflictingUid =
					classification.replacementPath === null
						? null
						: readUidBySourcePath(input.staging, 'slices', classification.replacementPath);
				if (
					classification.replacementPath !== null &&
					conflictingUid === null
				) {
					insertSlice(input.staging, row, planId, {
						sourcePath: classification.replacementPath,
						revision: row.revision + 1,
						updatedAt: input.now,
						deletedAt: null,
						lastSeenAt: null,
						lastSeenCommit: null,
						tombstoneReason: null,
					});
					if (pathChanged(row.source_path, classification.replacementPath)) {
						insertPathHistory(input.staging, {
							entity_type: 'slice',
							entity_uid: row.uid,
							from_path: row.source_path,
							to_path: classification.replacementPath,
							changed_at: input.now,
							source_commit: input.sourceCommit,
						});
					}
					relocated += 1;
					continue;
				}
				const lastSeen = resolveLastSeen(row, run, input.sourceCommit);
				insertSlice(input.staging, row, planId, {
					sourcePath: row.source_path,
					revision: row.revision + 1,
					updatedAt: input.now,
					deletedAt: input.now,
					lastSeenAt: lastSeen.lastSeenAt,
					lastSeenCommit: lastSeen.lastSeenCommit,
					tombstoneReason:
						classification.replacementPath !== null ? 'unknown' : classification.reason,
				});
				insertTombstone(input.staging, {
					entity_type: 'slice',
					entity_uid: row.uid,
					reason:
						classification.replacementPath !== null ? 'unknown' : classification.reason,
					deleted_at: input.now,
					last_seen_at: lastSeen.lastSeenAt,
					last_seen_commit: lastSeen.lastSeenCommit,
				});
				tombstoned += 1;
			}

			return { relocated, tombstoned };
		});
		return write.immediate();
	} finally {
		active.close();
	}
};