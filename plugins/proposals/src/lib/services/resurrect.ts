// effect-boundary-authorized: existsSync guards the bun:sqlite open. The
// driver opens the database file itself, outside ctx.effects, so mediating
// only the existence probe would suggest a supervision that does not exist.

import { existsSync } from 'node:fs';

import {
	LifecycleRepo,
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

export interface ITombstoneRecord {
	readonly uid: string;
	readonly kind: string;
	readonly deleted_at: number;
	readonly last_seen_at: number | null;
	readonly last_seen_commit: string | null;
	readonly reason: string | null;
	readonly path_history: readonly string[];
}

export interface IResurrectInput {
	readonly workspaceRoot: string;
	readonly uid: string;
	readonly note: string;
	readonly now?: number;
}

export interface IResurrectOutput {
	readonly uid: string;
	readonly entityType: 'proposal' | 'plan' | 'slice';
	readonly revision: number;
	readonly sourcePath: string | null;
	readonly lifecycleEventId: number;
}

const entityTables = ['proposals', 'plans', 'slices'] as const;
type IEntityTable = (typeof entityTables)[number];

const entityTypeFor = (table: IEntityTable): IResurrectOutput['entityType'] =>
	table.slice(0, -1) as IResurrectOutput['entityType'];

export const listTombstones = (
	workspaceRoot: string,
): readonly ITombstoneRecord[] => {
	const databasePath = resolveProposalsDbPaths(workspaceRoot).databasePath;
	if (!existsSync(databasePath)) return [];
	const driver = new ProposalsSqliteDriver({
		path: databasePath,
		readonly: true,
	});
	try {
		const records: ITombstoneRecord[] = [];
		for (const table of entityTables) {
			const rows = driver.handle
				.query<
					{
						uid: string;
						kind: string | null;
						deleted_at: number;
						last_seen_at: number | null;
						last_seen_commit: string | null;
						tombstone_reason: string | null;
						source_path: string | null;
					},
					[]
				>(
					`SELECT uid, ${table === 'proposals' ? 'kind' : 'NULL AS kind'},
						deleted_at, last_seen_at, last_seen_commit,
						tombstone_reason, source_path
					 FROM ${table}
					 WHERE deleted_at IS NOT NULL
					 ORDER BY deleted_at ASC, uid ASC`,
				)
				.all();
			for (const row of rows) {
				records.push({
					uid: row.uid,
					kind: row.kind ?? table.slice(0, -1),
					deleted_at: row.deleted_at,
					last_seen_at: row.last_seen_at,
					last_seen_commit: row.last_seen_commit,
					reason: row.tombstone_reason,
					path_history:
						row.source_path === null ? [] : [row.source_path],
				});
			}
		}
		return records.sort((left, right) => left.uid.localeCompare(right.uid));
	} finally {
		driver.close();
	}
};

export const resurrectEntity = (input: IResurrectInput): IResurrectOutput => {
	const databasePath = resolveProposalsDbPaths(
		input.workspaceRoot,
	).databasePath;
	if (!existsSync(databasePath)) {
		throw new Error(`proposals database not found: ${databasePath}`);
	}
	const driver = new ProposalsSqliteDriver({ path: databasePath });
	try {
		let output: IResurrectOutput | null = null;
		const tx = driver.handle.transaction(() => {
			for (const table of entityTables) {
				const row = driver.handle
					.query<
						{ revision: number; source_path: string | null },
						[string]
					>(
						`SELECT revision, source_path FROM ${table}
						 WHERE uid = ? AND deleted_at IS NOT NULL`,
					)
					.get(input.uid);
				if (!row) continue;
				driver.handle
					.prepare(
						`UPDATE ${table}
						 SET deleted_at = NULL, tombstone_reason = NULL,
							 revision = revision + 1, updated_at = ?
						 WHERE uid = ?`,
					)
					.run(input.now ?? Date.now(), input.uid);
				const revision = row.revision + 1;
				const event = new LifecycleRepo(driver.handle).append({
					entityType: entityTypeFor(table),
					entityUid: input.uid,
					entityRevision: revision,
					toStatus: 'entity_resurrected',
					actor: 'proposals_db_resurrect',
					source: 'proposals_db_resurrect',
					...(input.now === undefined
						? {}
						: { occurredAt: input.now }),
					metadata: JSON.stringify({ note: input.note }),
				});
				output = {
					uid: input.uid,
					entityType: entityTypeFor(table),
					revision,
					sourcePath: row.source_path,
					lifecycleEventId: event.id,
				};
				return;
			}
		});
		tx.immediate();
		if (!output) throw new Error(`tombstone not found: ${input.uid}`);
		return output;
	} finally {
		driver.close();
	}
};
