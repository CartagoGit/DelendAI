/**
 * sqlite-state.ts — the reconciler's state ports, bound to a REAL SQLite
 * file.
 *
 * Every write below is keyed the way the production work model keys it
 * (`uid` on a work unit, `(work_unit_id, generation)` on a checkpoint,
 * `(repository, number)` on a pull request, a content-derived `event_id`
 * on a journal entry), so the idempotency spec is not testing this
 * helper's discipline — it is testing that the reconciler addresses rows
 * by identity. If it ever stopped doing so, SQLite would produce a second
 * row and the assertion would fail.
 *
 * The projection digest is deliberately derived from the data itself: a
 * boot after nothing changed finds no stale projection and rebuilds
 * nothing, which is how the "warm machine is incremental" spec measures
 * work rather than trusting a flag.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type {
	IStartupStatePorts,
	IStateDatabaseSeam,
	TStateDatabaseProbe,
} from '@delendai/core/lib/startup-reconciler/index';

import {
	appliedVersions,
	applyTestMigrations,
	type ITestMigration,
	openTestDatabase,
	TEST_MIGRATIONS,
} from './sqlite-schema';

type TRow = Record<string, unknown>;

const num = (value: unknown): number =>
	typeof value === 'number'
		? value
		: typeof value === 'bigint'
			? Number(value)
			: 0;
const str = (value: unknown): string =>
	typeof value === 'string' ? value : '';
const strOrNull = (value: unknown): string | null =>
	typeof value === 'string' ? value : null;
const kind = (value: unknown): 'durability' | 'merge-candidate' =>
	value === 'merge-candidate' ? 'merge-candidate' : 'durability';
const scope = (value: unknown): readonly string[] => {
	if (typeof value !== 'string') return [];
	const parsed: unknown = JSON.parse(value);
	return Array.isArray(parsed)
		? parsed.filter((x) => typeof x === 'string')
		: [];
};

const parseJson = (value: string): unknown => JSON.parse(value);

const sha256 = (value: string): string =>
	createHash('sha256').update(value, 'utf8').digest('hex');

const canonicalPayload = (
	payload: Readonly<Record<string, unknown>> | undefined,
): string =>
	JSON.stringify(
		Object.fromEntries(
			Object.entries(payload ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)),
		),
	);

/** Same shape as the production `journalEventId`: content-derived. */
const eventId = (parts: readonly string[]): string =>
	sha256(parts.map((part) => `${String(part.length)}:${part}`).join('|'));

const workUnitUid = (args: {
	readonly forge: string;
	readonly owner: string;
	readonly name: string;
	readonly proposalUid: string;
	readonly sliceUid: string;
}): string =>
	`${args.forge}:${args.owner}/${args.name}#${args.proposalUid}/${args.sliceUid}`;

/** The projection whose freshness a boot checks. */
const PROJECTION = 'work-index';

const projectionDigest = (db: DatabaseSync): string => {
	const row = db
		.prepare(
			'SELECT COUNT(*) AS n, COALESCE(SUM(generation), 0) AS s FROM generations',
		)
		.get();
	const record: TRow = row ?? {};
	return `${String(num(record.n))}:${String(num(record.s))}`;
};

/** Build the ports over an open database. Exported for direct assertions. */
export const portsFor = (
	db: DatabaseSync,
	migrations: readonly ITestMigration[],
): IStartupStatePorts => ({
	schema: {
		integrityCheck: () => {
			const row: TRow = db.prepare('PRAGMA integrity_check').get() ?? {};
			const value = str(row.integrity_check);
			return value === 'ok'
				? { ok: true, problems: [] }
				: { ok: false, problems: [value] };
		},
		currentVersion: () => appliedVersions(db).at(-1) ?? 0,
		targetVersion: () => migrations.at(-1)?.version ?? 0,
		pendingMigrations: () => {
			const applied = new Set(appliedVersions(db));
			return migrations
				.filter((entry) => !applied.has(entry.version))
				.map((entry) => entry.name);
		},
		applyMigrations: () => {
			const applied = new Set(appliedVersions(db));
			return {
				applied: applyTestMigrations(db, migrations, Date.now()),
				ambiguous: migrations
					.filter(
						(entry) =>
							entry.ambiguous === true &&
							!applied.has(entry.version),
					)
					.map((entry) => entry.name),
			};
		},
		staleProjections: () => {
			const row: TRow =
				db
					.prepare(
						'SELECT source_digest FROM projections WHERE name = ?',
					)
					.get(PROJECTION) ?? {};
			return str(row.source_digest) === projectionDigest(db)
				? []
				: [PROJECTION];
		},
		rebuildProjections: (names) => {
			for (const name of names) {
				db.prepare(
					`INSERT INTO projections (name, source_digest, rebuilt_at)
					 VALUES (?, ?, ?)
					 ON CONFLICT (name) DO UPDATE SET
						source_digest = excluded.source_digest,
						rebuilt_at = excluded.rebuilt_at`,
				).run(name, projectionDigest(db), Date.now());
			}
			return names;
		},
	},
	registry: {
		registerRepository: (args) => {
			db.prepare(
				`INSERT INTO repositories (forge, owner, name, integration_branch, release_branch)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT (forge, owner, name) DO UPDATE SET
					integration_branch = excluded.integration_branch,
					release_branch = excluded.release_branch`,
			).run(
				args.forge,
				args.owner,
				args.name,
				args.integrationBranch,
				args.releaseBranch,
			);
			const row: TRow =
				db
					.prepare(
						'SELECT id, integration_branch, release_branch FROM repositories WHERE forge = ? AND owner = ? AND name = ?',
					)
					.get(args.forge, args.owner, args.name) ?? {};
			return {
				id: num(row.id),
				integrationBranch: str(row.integration_branch),
				releaseBranch: str(row.release_branch),
			};
		},
		registerMachine: (args) => {
			const now = args.now ?? Date.now();
			db.prepare(
				`INSERT INTO machines (machine_id, hostname, platform, first_seen, last_seen)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT (machine_id) DO UPDATE SET last_seen = excluded.last_seen`,
			).run(
				args.machineId,
				args.hostname,
				args.platform ?? null,
				now,
				now,
			);
			return { machineId: args.machineId };
		},
		registerAgent: (args) => {
			const now = args.now ?? Date.now();
			db.prepare(
				`INSERT INTO agents (id, host, machine_id, first_seen, last_seen)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET last_seen = excluded.last_seen`,
			).run(args.id, args.host, args.machineId, now, now);
			return { id: args.id };
		},
	},
	workUnits: {
		getByUid: (uid) => {
			const row = db
				.prepare('SELECT * FROM work_units WHERE uid = ?')
				.get(uid);
			return row === undefined ? null : mapUnit(row);
		},
		ensure: (args) => {
			const uid = workUnitUid({
				forge: args.repository.forge,
				owner: args.repository.owner,
				name: args.repository.name,
				proposalUid: args.proposalUid,
				sliceUid: args.sliceUid,
			});
			const now = args.now ?? Date.now();
			db.prepare(
				`INSERT INTO work_units (
					uid, repository_id, proposal_uid, slice_uid, state,
					current_generation, current_owner_agent_id,
					created_by_agent_id, created_at, updated_at
				) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
				ON CONFLICT (uid) DO NOTHING`,
			).run(
				uid,
				args.repositoryId,
				args.proposalUid,
				args.sliceUid,
				args.createdByAgentId,
				args.createdByAgentId,
				now,
				now,
			);
			const row = db
				.prepare('SELECT * FROM work_units WHERE uid = ?')
				.get(uid);
			if (row === undefined) throw new Error(`work unit ${uid} missing`);
			return mapUnit(row);
		},
		advanceGeneration: (uid, generation, now) => {
			db.prepare(
				`UPDATE work_units
				 SET current_generation = MAX(current_generation, ?), updated_at = ?
				 WHERE uid = ?`,
			).run(generation, now, uid);
		},
		listForRepository: (repositoryId) =>
			db
				.prepare(
					'SELECT * FROM work_units WHERE repository_id = ? ORDER BY uid',
				)
				.all(repositoryId)
				.map(mapUnit),
		markRecoverable: (uid, now) => {
			db.prepare(
				`UPDATE work_units SET state = 'recoverable', updated_at = ?
				 WHERE uid = ? AND state NOT IN ('integrated', 'deprecated')`,
			).run(now, uid);
			const row = db
				.prepare('SELECT * FROM work_units WHERE uid = ?')
				.get(uid);
			return row === undefined ? null : mapUnit(row);
		},
	},
	generations: {
		get: (workUnitId, generation) => {
			const row = db
				.prepare(
					'SELECT * FROM generations WHERE work_unit_id = ? AND generation = ?',
				)
				.get(workUnitId, generation);
			return row === undefined ? null : mapGeneration(row);
		},
		listForWorkUnit: (workUnitId) =>
			db
				.prepare(
					'SELECT * FROM generations WHERE work_unit_id = ? ORDER BY generation',
				)
				.all(workUnitId)
				.map(mapGeneration),
		record: (args) => {
			db.prepare(
				`INSERT INTO generations (
					work_unit_id, generation, base_integration_sha, wip_ref,
					wip_head_sha, patch_digest, file_scope_json, checkpoint_kind,
					candidate_state, validation_state, author_agent_id, machine_id
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'unknown', ?, ?)
				ON CONFLICT (work_unit_id, generation) DO UPDATE SET
					wip_head_sha = excluded.wip_head_sha,
					patch_digest = excluded.patch_digest,
					file_scope_json = excluded.file_scope_json,
					checkpoint_kind = excluded.checkpoint_kind`,
			).run(
				args.workUnitId,
				args.generation,
				args.baseIntegrationSha,
				args.wipRef,
				args.wipHeadSha,
				args.patchDigest,
				JSON.stringify([...new Set(args.fileScope)].sort()),
				args.checkpointKind,
				args.authorAgentId,
				args.machineId,
			);
			const row = db
				.prepare(
					'SELECT * FROM generations WHERE work_unit_id = ? AND generation = ?',
				)
				.get(args.workUnitId, args.generation);
			if (row === undefined)
				throw new Error('generation did not persist');
			return mapGeneration(row);
		},
		attachPullRequest: (args) => {
			db.prepare(
				`UPDATE generations SET pull_request_id = ?, candidate_state = 'proposed'
				 WHERE work_unit_id = ? AND generation = ?
				   AND checkpoint_kind = 'merge-candidate'`,
			).run(args.pullRequestId, args.workUnitId, args.generation);
			const row = db
				.prepare(
					'SELECT * FROM generations WHERE work_unit_id = ? AND generation = ?',
				)
				.get(args.workUnitId, args.generation);
			return row === undefined ? null : mapGeneration(row);
		},
		recordValidation: (args) => {
			db.prepare(
				`UPDATE generations SET validation_state = ?, ci_result = ?
				 WHERE work_unit_id = ? AND generation = ?`,
			).run(
				args.validationState,
				args.ciResult ?? null,
				args.workUnitId,
				args.generation,
			);
			const row = db
				.prepare(
					'SELECT * FROM generations WHERE work_unit_id = ? AND generation = ?',
				)
				.get(args.workUnitId, args.generation);
			return row === undefined ? null : mapGeneration(row);
		},
		markIntegrated: (args) => {
			const result = db
				.prepare(
					`UPDATE generations
					 SET integrated_sha = ?, candidate_state = 'integrated'
					 WHERE work_unit_id = ? AND generation = ? AND integrated_sha IS NULL`,
				)
				.run(args.integratedSha, args.workUnitId, args.generation);
			return { first: num(result.changes) === 1 };
		},
	},
	forge: {
		upsertPullRequest: (args) => {
			db.prepare(
				`INSERT INTO pull_requests (
					repository_id, number, head_ref, base_ref, head_sha, state, merge_sha
				) VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (repository_id, number) DO UPDATE SET
					head_ref = excluded.head_ref,
					base_ref = excluded.base_ref,
					head_sha = excluded.head_sha,
					state = excluded.state,
					merge_sha = excluded.merge_sha`,
			).run(
				args.repositoryId,
				args.number,
				args.headRef,
				args.baseRef,
				args.headSha,
				args.state,
				args.mergeSha ?? null,
			);
			const row: TRow =
				db
					.prepare(
						'SELECT id FROM pull_requests WHERE repository_id = ? AND number = ?',
					)
					.get(args.repositoryId, args.number) ?? {};
			return { id: num(row.id) };
		},
		upsertCiRun: (args) => {
			db.prepare(
				`INSERT INTO ci_runs (
					repository_id, candidate_sha, workflow, check_name, external_id,
					state, started_at, completed_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (repository_id, candidate_sha, workflow, check_name)
				DO UPDATE SET state = excluded.state, completed_at = excluded.completed_at`,
			).run(
				args.repositoryId,
				args.candidateSha,
				args.workflow,
				args.checkName,
				args.externalId ?? null,
				args.state,
				args.startedAt ?? null,
				args.completedAt ?? null,
			);
			const row: TRow =
				db
					.prepare(
						`SELECT id FROM ci_runs WHERE repository_id = ? AND candidate_sha = ?
						 AND workflow = ? AND check_name = ?`,
					)
					.get(
						args.repositoryId,
						args.candidateSha,
						args.workflow,
						args.checkName,
					) ?? {};
			return { id: num(row.id) };
		},
	},
	journal: {
		append: (args) => {
			const payloadJson = canonicalPayload(args.payload);
			const id = eventId([
				'journal',
				args.eventKind,
				args.repositoryUid ?? '',
				args.workUnitUid ?? '',
				args.generation === undefined ? '' : String(args.generation),
				args.actorAgentId ?? '',
				String(args.occurredAt),
				payloadJson,
			]);
			const result = db
				.prepare(
					`INSERT INTO coordination_journal (
						event_id, event_kind, repository_uid, work_unit_uid,
						proposal_uid, slice_uid, generation, actor_agent_id,
						machine_id, occurred_at, recorded_at, payload_json
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (event_id) DO NOTHING`,
				)
				.run(
					id,
					args.eventKind,
					args.repositoryUid ?? null,
					args.workUnitUid ?? null,
					args.proposalUid ?? null,
					args.sliceUid ?? null,
					args.generation ?? null,
					args.actorAgentId ?? null,
					args.machineId ?? null,
					args.occurredAt,
					Date.now(),
					payloadJson,
				);
			return { appended: num(result.changes) === 1 };
		},
		listAll: () =>
			db
				.prepare('SELECT * FROM coordination_journal ORDER BY id')
				.all()
				.map((row) => {
					const record: TRow = row;
					return {
						eventKind: str(record.event_kind),
						machineId: strOrNull(record.machine_id),
						occurredAt: num(record.occurred_at),
						payload: parseJson(str(record.payload_json)),
					};
				}),
	},
	leases: {
		listLive: (now) =>
			db
				.prepare(
					'SELECT * FROM leases WHERE released_at IS NULL AND expires_at > ?',
				)
				.all(now)
				.map(mapLease),
		listExpired: (now) =>
			db
				.prepare(
					'SELECT * FROM leases WHERE released_at IS NULL AND expires_at <= ?',
				)
				.all(now)
				.map(mapLease),
		expire: (id, now) => {
			const result = db
				.prepare(
					'UPDATE leases SET released_at = ? WHERE id = ? AND released_at IS NULL',
				)
				.run(now, id);
			return {
				kind: num(result.changes) === 1 ? 'expired' : 'not_expirable',
			};
		},
	},
	claims: {
		listActive: (repositoryId) =>
			db
				.prepare(
					'SELECT * FROM claims WHERE repository_id = ? AND released_at IS NULL',
				)
				.all(repositoryId)
				.map((row) => {
					const record: TRow = row;
					return {
						path: str(record.path),
						ownerAgentId: str(record.owner_agent_id),
						leaseId: str(record.lease_id),
						workUnitId: num(record.work_unit_id),
					};
				}),
		releaseClaimsOfExpiredLeases: (now) => {
			const result = db
				.prepare(
					`UPDATE claims SET released_at = ?
					 WHERE released_at IS NULL AND lease_id IN (
						SELECT id FROM leases
						WHERE released_at IS NOT NULL OR expires_at <= ?
					 )`,
				)
				.run(now, now);
			return num(result.changes);
		},
	},
	reconciliation: {
		start: (args) => {
			const result = db
				.prepare(
					`INSERT INTO work_reconciliation_runs (machine_id, repository_id, started_at, status)
					 VALUES (?, ?, ?, 'running')`,
				)
				.run(args.machineId, args.repositoryId ?? null, args.startedAt);
			return { id: num(result.lastInsertRowid) };
		},
		complete: (args) =>
			db
				.prepare(
					`UPDATE work_reconciliation_runs
					 SET status = ?, completed_at = ?, refs_discovered = ?,
						 work_units_repaired = ?, generations_repaired = ?,
						 claims_released = ?, anomalies_json = ?
					 WHERE id = ? AND completed_at IS NULL`,
				)
				.run(
					args.status,
					args.completedAt,
					args.refsDiscovered ?? 0,
					args.workUnitsRepaired ?? 0,
					args.generationsRepaired ?? 0,
					args.claimsReleased ?? 0,
					JSON.stringify(args.anomalies ?? []),
					args.id,
				),
	},
});

const mapUnit = (row: TRow) => ({
	id: num(row.id),
	uid: str(row.uid),
	proposalUid: str(row.proposal_uid),
	sliceUid: str(row.slice_uid),
	state: str(row.state),
	currentGeneration: num(row.current_generation),
	currentOwnerAgentId: strOrNull(row.current_owner_agent_id),
});

const mapGeneration = (row: TRow) => ({
	id: num(row.id),
	workUnitId: num(row.work_unit_id),
	generation: num(row.generation),
	baseIntegrationSha: str(row.base_integration_sha),
	wipRef: str(row.wip_ref),
	wipHeadSha: str(row.wip_head_sha),
	patchDigest: str(row.patch_digest),
	fileScope: scope(row.file_scope_json),
	checkpointKind: kind(row.checkpoint_kind),
	candidateState: str(row.candidate_state),
	authorAgentId: str(row.author_agent_id),
	machineId: str(row.machine_id),
	integratedSha: strOrNull(row.integrated_sha),
});

const mapLease = (row: TRow) => ({
	id: str(row.id),
	ownerAgentId: str(row.owner_agent_id),
	machineId: str(row.machine_id),
	expiresAt: num(row.expires_at),
});

export interface ITestStateOptions {
	readonly path: string;
	/** Restrict the shipped migrations, to simulate an older database. */
	readonly migrations?: readonly ITestMigration[];
}

/** A state-database seam over a real file, plus the handle for assertions. */
export interface ITestStateDatabase extends IStateDatabaseSeam {
	/** The open handle, or undefined until `open` succeeded. */
	handle(): DatabaseSync | undefined;
	close(): void;
}

export const createTestStateDatabase = (
	options: ITestStateOptions,
): ITestStateDatabase => {
	const migrations = options.migrations ?? TEST_MIGRATIONS;
	let db: DatabaseSync | undefined;

	return {
		probe: (): TStateDatabaseProbe => {
			if (!existsSync(options.path)) {
				return { kind: 'absent', path: options.path };
			}
			try {
				const probe = openTestDatabase(options.path);
				probe.prepare('PRAGMA integrity_check').get();
				probe.close();
				return { kind: 'present', path: options.path };
			} catch (error) {
				return {
					kind: 'unreadable',
					path: options.path,
					reason: error instanceof Error ? error.message : 'unknown',
				};
			}
		},
		open: ({ allowCreate }) => {
			if (!allowCreate && !existsSync(options.path)) {
				return { kind: 'absent' };
			}
			try {
				// SQLite creates the FILE, never its parent directory —
				// the production driver mkdir's for the same reason.
				if (allowCreate) {
					mkdirSync(dirname(options.path), { recursive: true });
				}
				db = db ?? openTestDatabase(options.path);
				return { kind: 'opened', ports: portsFor(db, migrations) };
			} catch (error) {
				return {
					kind: 'unreadable',
					reason:
						error instanceof Error
							? error.message
							: 'unknown error',
				};
			}
		},
		handle: () => db,
		close: () => {
			db?.close();
			db = undefined;
		},
	};
};

/** Count rows, for the idempotency assertions. */
export const countRows = (db: DatabaseSync, table: string): number => {
	const row: TRow =
		db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() ?? {};
	return num(row.n);
};
