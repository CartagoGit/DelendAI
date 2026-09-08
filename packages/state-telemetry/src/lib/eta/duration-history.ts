/**
 * duration-history.ts — q00020 F3 S2.
 *
 * Local, append-only history of how long analogous work actually took.
 * One row per accepted terminal transition:
 *
 *   duration_history(
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     feature_vector_hash TEXT NOT NULL,
 *     actor_profile TEXT NOT NULL,
 *     task_kind TEXT NOT NULL,
 *     duration_ms INTEGER NOT NULL,
 *     outcome TEXT NOT NULL,
 *     created_at INTEGER NOT NULL
 *   ) STRICT
 *
 * NOTE ON THE KEY. The proposal calls `(feature_vector_hash,
 * actor_profile, task_kind)` the "composite PK". It cannot be a real
 * PRIMARY KEY: the whole point of the table is to hold MANY samples
 * per key so `eta-engine.ts` can take a median and a p80 over them,
 * and its own acceptance says a repeated key "se inserta como nueva
 * fila". So the triple is the composite *lookup key* — a covering
 * index — and the row identity is the autoincrement id. A UNIQUE
 * constraint here would cap every key at a single sample and make the
 * ETA impossible to compute.
 *
 * Only terminal-and-successful outcomes are recorded: `done` and
 * `review` count, `blocked` (and anything else) is dropped, because a
 * blocked slice measures an interruption, not the cost of the work.
 *
 * This module owns the storage and the insert path. It does NOT wire
 * itself into `proposal_transition`; `recordTransitionDuration` below
 * is the clean seam that call site is expected to use.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { Database } from 'bun:sqlite';

import { median } from './eta-aggregation';
import { canonicalHash, type IWorkFeatureVector } from './feature-vector';

export const DURATION_HISTORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS duration_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	feature_vector_hash TEXT NOT NULL,
	actor_profile TEXT NOT NULL,
	task_kind TEXT NOT NULL,
	duration_ms INTEGER NOT NULL,
	outcome TEXT NOT NULL,
	created_at INTEGER NOT NULL
) STRICT;
`;

/** Covering index for the specific `(vector, actor, kind)` lookup. */
export const DURATION_HISTORY_KEY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_duration_history_key
ON duration_history(feature_vector_hash, actor_profile, task_kind, id);
`;

/** Covering index for the global `task_kind` fallback aggregate. */
export const DURATION_HISTORY_KIND_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_duration_history_kind
ON duration_history(task_kind, actor_profile, id);
`;

export const DURATION_HISTORY_SCHEMA_SQL = [
	DURATION_HISTORY_TABLE_SQL,
	DURATION_HISTORY_KEY_INDEX_SQL,
	DURATION_HISTORY_KIND_INDEX_SQL,
] as const;

export const DURATION_HISTORY_BOOT_PRAGMAS = [
	'PRAGMA journal_mode = WAL;',
	'PRAGMA synchronous = NORMAL;',
	'PRAGMA busy_timeout = 5000;',
	'PRAGMA foreign_keys = OFF;',
] as const;

/** Outcomes that are worth measuring. */
export const RECORDABLE_OUTCOMES = ['done', 'review'] as const;

export type TRecordableOutcome = (typeof RECORDABLE_OUTCOMES)[number];

export const isRecordableOutcome = (
	value: string
): value is TRecordableOutcome =>
	(RECORDABLE_OUTCOMES as readonly string[]).includes(value);

export interface IDurationSample {
	readonly id: number;
	readonly feature_vector_hash: string;
	readonly actor_profile: string;
	readonly task_kind: string;
	readonly duration_ms: number;
	readonly outcome: TRecordableOutcome;
	readonly created_at: number;
}

export interface IRecordDurationInput {
	/** Either the vector itself or a precomputed canonical hash. */
	readonly vector?: IWorkFeatureVector | undefined;
	readonly featureVectorHash?: string | undefined;
	readonly actorProfile: string;
	readonly taskKind: string;
	readonly durationMs: number;
	readonly outcome: string;
	readonly createdAt?: number | undefined;
}

export type TSkipReason =
	| 'non_recordable_outcome'
	| 'invalid_duration'
	| 'missing_feature_vector'
	| 'median_unchanged'
	| 'store_unavailable';

export type TRecordDurationResult =
	| { readonly recorded: true; readonly sample: IDurationSample }
	| { readonly recorded: false; readonly reason: TSkipReason };

/**
 * The read surface `eta-engine.ts` needs. Kept separate from the
 * concrete store so the engine stays a pure function over samples.
 */
export interface IDurationSampleSource {
	samplesForVectorActor(
		featureVectorHash: string,
		actorProfile: string
	): readonly number[];
	samplesForTaskKind(
		taskKind: string,
		actorProfile: string
	): readonly number[];
}

export interface IDurationHistoryStore extends IDurationSampleSource {
	recordDuration(input: IRecordDurationInput): TRecordDurationResult;
	count(): number;
	close(): void;
}

/**
 * Past this many samples for one key, a new sample is only persisted
 * if it actually moves the median (see `MEDIAN_DELTA_THRESHOLD`).
 * Below it every sample is kept, so the 5-sample threshold the ETA
 * engine cares about is never affected by this guard.
 */
export const MEDIAN_GUARD_MIN_SAMPLES = 10;

/** Relative median move (5%) required to keep a guarded sample. */
export const MEDIAN_DELTA_THRESHOLD = 0.05;

const resolveHash = (input: IRecordDurationInput): string | undefined => {
	if (input.featureVectorHash !== undefined) return input.featureVectorHash;
	if (input.vector !== undefined) return canonicalHash(input.vector);
	return undefined;
};

const isValidDuration = (value: number): boolean =>
	Number.isFinite(value) && value > 0;

/**
 * Decides whether a sample that would exceed `MEDIAN_GUARD_MIN_SAMPLES`
 * is worth storing: only if it moves the median of the key by more
 * than `MEDIAN_DELTA_THRESHOLD` in relative terms.
 */
export const passesMedianGuard = (
	existing: readonly number[],
	candidate: number
): boolean => {
	if (existing.length < MEDIAN_GUARD_MIN_SAMPLES) return true;
	const before = median(existing);
	const after = median([...existing, candidate]);
	if (before === 0) return after !== 0;
	return Math.abs(after - before) / before > MEDIAN_DELTA_THRESHOLD;
};

export interface ISqliteDurationHistoryStoreOptions {
	readonly path: string;
	readonly now?: (() => number) | undefined;
	/** Set false to keep every sample regardless of median movement. */
	readonly medianGuard?: boolean | undefined;
}

interface IRawRow {
	id: number;
	feature_vector_hash: string;
	actor_profile: string;
	task_kind: string;
	duration_ms: number;
	outcome: string;
	created_at: number;
}

export class SqliteDurationHistoryStore implements IDurationHistoryStore {
	private readonly db: Database;
	private readonly now: () => number;
	private readonly medianGuard: boolean;
	private closed = false;

	constructor(options: ISqliteDurationHistoryStoreOptions) {
		mkdirSync(dirname(options.path), { recursive: true });
		this.db = new Database(options.path, { create: true, strict: true });
		for (const pragma of DURATION_HISTORY_BOOT_PRAGMAS) this.db.exec(pragma);
		for (const statement of DURATION_HISTORY_SCHEMA_SQL)
			this.db.exec(statement);
		this.now = options.now ?? (() => Date.now());
		this.medianGuard = options.medianGuard ?? true;
	}

	recordDuration(input: IRecordDurationInput): TRecordDurationResult {
		if (this.closed) return { recorded: false, reason: 'store_unavailable' };
		if (!isRecordableOutcome(input.outcome)) {
			return { recorded: false, reason: 'non_recordable_outcome' };
		}
		if (!isValidDuration(input.durationMs)) {
			return { recorded: false, reason: 'invalid_duration' };
		}
		const hash = resolveHash(input);
		if (hash === undefined) {
			return { recorded: false, reason: 'missing_feature_vector' };
		}
		const durationMs = Math.round(input.durationMs);
		if (this.medianGuard) {
			const existing = this.samplesForKey(
				hash,
				input.actorProfile,
				input.taskKind
			);
			if (!passesMedianGuard(existing, durationMs)) {
				return { recorded: false, reason: 'median_unchanged' };
			}
		}
		const createdAt = input.createdAt ?? this.now();
		const result = this.db
			.prepare(
				`INSERT INTO duration_history (
					feature_vector_hash, actor_profile, task_kind,
					duration_ms, outcome, created_at
				) VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(
				hash,
				input.actorProfile,
				input.taskKind,
				durationMs,
				input.outcome,
				createdAt
			);
		return {
			recorded: true,
			sample: {
				id: Number(result.lastInsertRowid),
				feature_vector_hash: hash,
				actor_profile: input.actorProfile,
				task_kind: input.taskKind,
				duration_ms: durationMs,
				outcome: input.outcome,
				created_at: createdAt,
			},
		};
	}

	/** Samples for the full composite key, oldest first. */
	samplesForKey(
		featureVectorHash: string,
		actorProfile: string,
		taskKind: string
	): readonly number[] {
		return this.db
			.prepare(
				`SELECT duration_ms FROM duration_history
				 WHERE feature_vector_hash = ? AND actor_profile = ?
				   AND task_kind = ?
				 ORDER BY id ASC`
			)
			.all(featureVectorHash, actorProfile, taskKind)
			.map((row) => (row as { duration_ms: number }).duration_ms);
	}

	samplesForVectorActor(
		featureVectorHash: string,
		actorProfile: string
	): readonly number[] {
		return this.db
			.prepare(
				`SELECT duration_ms FROM duration_history
				 WHERE feature_vector_hash = ? AND actor_profile = ?
				 ORDER BY id ASC`
			)
			.all(featureVectorHash, actorProfile)
			.map((row) => (row as { duration_ms: number }).duration_ms);
	}

	samplesForTaskKind(
		taskKind: string,
		actorProfile: string
	): readonly number[] {
		return this.db
			.prepare(
				`SELECT duration_ms FROM duration_history
				 WHERE task_kind = ? AND actor_profile = ?
				 ORDER BY id ASC`
			)
			.all(taskKind, actorProfile)
			.map((row) => (row as { duration_ms: number }).duration_ms);
	}

	list(): readonly IDurationSample[] {
		return this.db
			.prepare(
				`SELECT id, feature_vector_hash, actor_profile, task_kind,
				        duration_ms, outcome, created_at
				 FROM duration_history ORDER BY id ASC`
			)
			.all()
			.map((row) => {
				const raw = row as IRawRow;
				return {
					...raw,
					outcome: raw.outcome as TRecordableOutcome,
				};
			});
	}

	count(): number {
		const row = this.db
			.prepare<
				{ total: number },
				[]
			>(`SELECT COUNT(*) AS total FROM duration_history`)
			.get();
		return row?.total ?? 0;
	}

	close(): void {
		if (this.closed) return;
		this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
		this.db.close();
		this.closed = true;
	}
}

/**
 * Non-durable fallback used when SQLite cannot boot. Keeps the ETA
 * engine working for the current process instead of throwing; the
 * history is simply lost on exit, which is the correct trade for a
 * purely advisory number.
 */
export class MemoryDurationHistoryStore implements IDurationHistoryStore {
	private readonly rows: IDurationSample[] = [];
	private readonly now: () => number;
	private readonly medianGuard: boolean;
	private nextId = 1;

	constructor(
		options: {
			now?: (() => number) | undefined;
			medianGuard?: boolean | undefined;
		} = {}
	) {
		this.now = options.now ?? (() => Date.now());
		this.medianGuard = options.medianGuard ?? true;
	}

	recordDuration(input: IRecordDurationInput): TRecordDurationResult {
		if (!isRecordableOutcome(input.outcome)) {
			return { recorded: false, reason: 'non_recordable_outcome' };
		}
		if (!isValidDuration(input.durationMs)) {
			return { recorded: false, reason: 'invalid_duration' };
		}
		const hash = resolveHash(input);
		if (hash === undefined) {
			return { recorded: false, reason: 'missing_feature_vector' };
		}
		const durationMs = Math.round(input.durationMs);
		if (this.medianGuard) {
			const existing = this.rows
				.filter(
					(row) =>
						row.feature_vector_hash === hash &&
						row.actor_profile === input.actorProfile &&
						row.task_kind === input.taskKind
				)
				.map((row) => row.duration_ms);
			if (!passesMedianGuard(existing, durationMs)) {
				return { recorded: false, reason: 'median_unchanged' };
			}
		}
		const sample: IDurationSample = {
			id: this.nextId++,
			feature_vector_hash: hash,
			actor_profile: input.actorProfile,
			task_kind: input.taskKind,
			duration_ms: durationMs,
			outcome: input.outcome,
			created_at: input.createdAt ?? this.now(),
		};
		this.rows.push(sample);
		return { recorded: true, sample };
	}

	samplesForVectorActor(
		featureVectorHash: string,
		actorProfile: string
	): readonly number[] {
		return this.rows
			.filter(
				(row) =>
					row.feature_vector_hash === featureVectorHash &&
					row.actor_profile === actorProfile
			)
			.map((row) => row.duration_ms);
	}

	samplesForTaskKind(
		taskKind: string,
		actorProfile: string
	): readonly number[] {
		return this.rows
			.filter(
				(row) =>
					row.task_kind === taskKind &&
					row.actor_profile === actorProfile
			)
			.map((row) => row.duration_ms);
	}

	list(): readonly IDurationSample[] {
		return [...this.rows];
	}

	count(): number {
		return this.rows.length;
	}

	close(): void {
		// Nothing to release.
	}
}

export type TDurationHistoryBackend = 'sqlite' | 'memory';

export interface IDurationHistoryFacadeOptions {
	readonly path?: string | undefined;
	readonly now?: (() => number) | undefined;
	readonly medianGuard?: boolean | undefined;
	readonly forceBackend?: TDurationHistoryBackend | undefined;
}

export const DEFAULT_DURATION_HISTORY_PATH =
	'.cache/delendai/telemetry/duration-history.sqlite';

/**
 * SQLite primary, in-memory fallback, decision made ONCE at
 * construction, never throws at startup. Same contract as
 * `WorkEventStoreFacade` — an ETA is advisory, so a broken cache
 * directory must degrade, not break the transition that produced it.
 */
export class DurationHistoryFacade implements IDurationHistoryStore {
	private readonly backendKind: TDurationHistoryBackend;
	private readonly store: IDurationHistoryStore;

	constructor(options: IDurationHistoryFacadeOptions = {}) {
		const desired = options.forceBackend ?? 'sqlite';
		if (desired === 'sqlite') {
			try {
				this.store = new SqliteDurationHistoryStore({
					path: options.path ?? DEFAULT_DURATION_HISTORY_PATH,
					now: options.now,
					medianGuard: options.medianGuard,
				});
				this.backendKind = 'sqlite';
				return;
			} catch {
				// Degrade instead of failing the caller's transition.
			}
		}
		this.store = new MemoryDurationHistoryStore({
			now: options.now,
			medianGuard: options.medianGuard,
		});
		this.backendKind = 'memory';
	}

	get activeBackend(): TDurationHistoryBackend {
		return this.backendKind;
	}

	recordDuration(input: IRecordDurationInput): TRecordDurationResult {
		try {
			return this.store.recordDuration(input);
		} catch {
			return { recorded: false, reason: 'store_unavailable' };
		}
	}

	samplesForVectorActor(
		featureVectorHash: string,
		actorProfile: string
	): readonly number[] {
		try {
			return this.store.samplesForVectorActor(
				featureVectorHash,
				actorProfile
			);
		} catch {
			return [];
		}
	}

	samplesForTaskKind(
		taskKind: string,
		actorProfile: string
	): readonly number[] {
		try {
			return this.store.samplesForTaskKind(taskKind, actorProfile);
		} catch {
			return [];
		}
	}

	count(): number {
		try {
			return this.store.count();
		} catch {
			return 0;
		}
	}

	close(): void {
		try {
			this.store.close();
		} catch {
			// Closing a store that never booted cleanly is not an error.
		}
	}
}

/**
 * The seam `plugins/proposals/.../proposal-transition.tool.ts` is meant
 * to call after it has written the frontmatter, off the critical path
 * (`void recordTransitionDuration(...)` — it never throws and never
 * needs awaiting).
 *
 * It exists here, rather than being inlined at the call site, because
 * `packages/state-telemetry` must not depend on the proposals plugin.
 * Wiring the call site is a follow-up owned by that plugin.
 */
export interface ITransitionDurationInput {
	/** Target status of the transition (`done`, `review`, ...). */
	readonly to: string;
	readonly vector?: IWorkFeatureVector | undefined;
	readonly featureVectorHash?: string | undefined;
	readonly actorProfile: string;
	readonly taskKind: string;
	readonly durationMs: number;
	readonly createdAt?: number | undefined;
}

export const recordTransitionDuration = (
	store: Pick<IDurationHistoryStore, 'recordDuration'>,
	input: ITransitionDurationInput
): TRecordDurationResult =>
	store.recordDuration({
		vector: input.vector,
		featureVectorHash: input.featureVectorHash,
		actorProfile: input.actorProfile,
		taskKind: input.taskKind,
		durationMs: input.durationMs,
		outcome: input.to,
		createdAt: input.createdAt,
	});
