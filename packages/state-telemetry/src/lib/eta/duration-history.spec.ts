import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DurationHistoryFacade,
	MEDIAN_GUARD_MIN_SAMPLES,
	MemoryDurationHistoryStore,
	passesMedianGuard,
	recordTransitionDuration,
	SqliteDurationHistoryStore,
} from './duration-history';
import { computeFeatureVector } from './feature-vector';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'state-telemetry-duration-'));

const ACTOR = 'agent:implementation-runner';
const KIND = 'slice';

describe('SqliteDurationHistoryStore (f00511 S2)', () => {
	let dir: string;
	let path: string;
	let store: SqliteDurationHistoryStore;

	beforeEach(() => {
		dir = makeTmpDir();
		path = join(dir, 'duration-history.sqlite');
		store = new SqliteDurationHistoryStore({ path, medianGuard: false });
	});

	afterEach(() => {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates a STRICT duration_history table that passes integrity_check', () => {
		store.recordDuration({
			vector: computeFeatureVector({ slice_count: 1 }),
			actorProfile: ACTOR,
			taskKind: KIND,
			durationMs: 1000,
			outcome: 'done',
		});
		store.close();

		const raw = new Database(path, { strict: true });
		const integrity = raw
			.prepare<{ integrity_check: string }, []>('PRAGMA integrity_check')
			.get();
		expect(integrity?.integrity_check).toBe('ok');

		const sql = raw
			.prepare<{ sql: string }, []>(
				`SELECT sql FROM sqlite_master WHERE name = 'duration_history'`,
			)
			.get();
		expect(sql?.sql).toContain('STRICT');

		// STRICT means a TEXT duration is rejected, not silently coerced.
		expect(() =>
			raw
				.prepare(
					`INSERT INTO duration_history (
						feature_vector_hash, actor_profile, task_kind,
						duration_ms, outcome, created_at
					) VALUES ('h', 'a', 'k', 'not-a-number', 'done', 1)`,
				)
				.run(),
		).toThrow();
		raw.close();
	});

	it('keys rows by (feature_vector_hash, actor_profile, task_kind) and keeps every sample', () => {
		const vector = computeFeatureVector({ slice_count: 2 });
		for (const durationMs of [1000, 2000, 3000]) {
			const result = store.recordDuration({
				vector,
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs,
				outcome: 'done',
			});
			expect(result.recorded).toBe(true);
		}
		// Same vector, different actor: a separate key.
		store.recordDuration({
			vector,
			actorProfile: 'agent:other',
			taskKind: KIND,
			durationMs: 9000,
			outcome: 'done',
		});

		expect(store.count()).toBe(4);
		expect(
			store.samplesForVectorActor(
				store.list()[0]!.feature_vector_hash,
				ACTOR,
			),
		).toEqual([1000, 2000, 3000]);
		expect(store.samplesForTaskKind(KIND, ACTOR)).toEqual([
			1000, 2000, 3000,
		]);
		expect(store.samplesForTaskKind(KIND, 'agent:other')).toEqual([9000]);
	});

	it('records done and review but drops blocked and any other outcome', () => {
		const vector = computeFeatureVector({ slice_count: 3 });
		const base = {
			vector,
			actorProfile: ACTOR,
			taskKind: KIND,
			durationMs: 1000,
		};
		expect(
			store.recordDuration({ ...base, outcome: 'done' }).recorded,
		).toBe(true);
		expect(
			store.recordDuration({ ...base, outcome: 'review' }).recorded,
		).toBe(true);
		const blocked = store.recordDuration({ ...base, outcome: 'blocked' });
		expect(blocked).toEqual({
			recorded: false,
			reason: 'non_recordable_outcome',
		});
		expect(
			store.recordDuration({ ...base, outcome: 'in-progress' }).recorded,
		).toBe(false);
		expect(store.count()).toBe(2);
	});

	it('rejects a non-positive or non-finite duration and a missing vector', () => {
		const vector = computeFeatureVector({ slice_count: 1 });
		expect(
			store.recordDuration({
				vector,
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs: 0,
				outcome: 'done',
			}),
		).toEqual({ recorded: false, reason: 'invalid_duration' });
		expect(
			store.recordDuration({
				vector,
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs: Number.NaN,
				outcome: 'done',
			}),
		).toEqual({ recorded: false, reason: 'invalid_duration' });
		expect(
			store.recordDuration({
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs: 500,
				outcome: 'done',
			}),
		).toEqual({ recorded: false, reason: 'missing_feature_vector' });
		expect(store.count()).toBe(0);
	});

	it('writes 10 rows for 10 transitions with distinct vectors', () => {
		for (let index = 0; index < 10; index += 1) {
			const result = recordTransitionDuration(store, {
				to: 'done',
				vector: computeFeatureVector({ slice_count: index + 1 }),
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs: 1000 + index,
			});
			expect(result.recorded).toBe(true);
		}
		expect(store.count()).toBe(10);
		const hashes = new Set(
			store.list().map((row) => row.feature_vector_hash),
		);
		expect(hashes.size).toBe(10);
	});
});

describe('median guard past MEDIAN_GUARD_MIN_SAMPLES (f00511 S2)', () => {
	it('keeps every sample below the guard threshold', () => {
		const existing = Array.from(
			{ length: MEDIAN_GUARD_MIN_SAMPLES - 1 },
			() => 1000,
		);
		expect(passesMedianGuard(existing, 1000)).toBe(true);
		expect(passesMedianGuard([], 1)).toBe(true);
	});

	it('drops an 11th sample that moves the median by <=5% and keeps one that moves it more', () => {
		const existing = Array.from(
			{ length: MEDIAN_GUARD_MIN_SAMPLES },
			() => 1000,
		);
		// median stays 1000 -> 0% move -> dropped.
		expect(passesMedianGuard(existing, 1000)).toBe(false);
		// A far outlier still cannot move a median of ten identical
		// values, which is exactly the outlier absorption we want.
		expect(passesMedianGuard(existing, 100_000)).toBe(false);
		// A rising series does move it.
		const rising = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
		expect(passesMedianGuard(rising, 100_000)).toBe(true);
	});

	it('applies the guard on the store: the 11th identical sample is not inserted', () => {
		const store = new MemoryDurationHistoryStore();
		const vector = computeFeatureVector({ slice_count: 4 });
		const input = {
			vector,
			actorProfile: ACTOR,
			taskKind: KIND,
			durationMs: 1000,
			outcome: 'done',
		};
		for (let index = 0; index < MEDIAN_GUARD_MIN_SAMPLES; index += 1) {
			expect(store.recordDuration(input).recorded).toBe(true);
		}
		expect(store.recordDuration(input)).toEqual({
			recorded: false,
			reason: 'median_unchanged',
		});
		expect(store.count()).toBe(MEDIAN_GUARD_MIN_SAMPLES);
		store.close();
	});
});

describe('DurationHistoryFacade (f00511 S2)', () => {
	it('boots on sqlite when the path is writable', () => {
		const dir = makeTmpDir();
		const facade = new DurationHistoryFacade({
			path: join(dir, 'nested', 'duration-history.sqlite'),
			medianGuard: false,
		});
		expect(facade.activeBackend).toBe('sqlite');
		expect(
			facade.recordDuration({
				vector: computeFeatureVector({ slice_count: 1 }),
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs: 1234,
				outcome: 'done',
			}).recorded,
		).toBe(true);
		expect(facade.count()).toBe(1);
		facade.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('degrades to memory instead of throwing when sqlite cannot boot', () => {
		const dir = makeTmpDir();
		// A directory where the db file should be: sqlite cannot open it.
		const facade = new DurationHistoryFacade({
			path: dir,
			medianGuard: false,
		});
		expect(facade.activeBackend).toBe('memory');
		expect(
			facade.recordDuration({
				vector: computeFeatureVector({ slice_count: 1 }),
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs: 10,
				outcome: 'done',
			}).recorded,
		).toBe(true);
		facade.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('decides the backend once, at construction', () => {
		const facade = new DurationHistoryFacade({ forceBackend: 'memory' });
		expect(facade.activeBackend).toBe('memory');
		expect(facade.activeBackend).toBe('memory');
		facade.close();
	});
});
