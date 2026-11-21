import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StormDetector } from '@delendai/commit-policy/lib/services/storm-detector';
import { StormLog } from '@delendai/commit-policy/lib/services/storm-log';

import type { IStormLogEntry } from '@delendai/commit-policy/lib/services/storm-log';

describe('StormLog (x00419 S4)', () => {
	let cacheDir: string;
	const baseNow = 1_800_000_000_000;

	const stormsDir = (): string => join(cacheDir, 'storms');

	const createEntry = (
		overrides: Partial<IStormLogEntry> = {},
	): IStormLogEntry => ({
		trigger: 'slice',
		code: 'WORKSPACE_HAS_NO_FILES',
		firstSeenAt: baseNow - 10_000,
		lastSeenAt: baseNow - 1_000,
		timestamps: [baseNow - 10_000, baseNow - 5_000, baseNow - 1_000],
		sampleProposalIds: ['x1', 'x2'],
		suggestedFix: 'check resolve-scope.ts',
		...overrides,
	});

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), 'storm-log-test-'));
	});

	afterEach(() => {
		rmSync(cacheDir, { recursive: true, force: true });
	});

	it('returns an empty list when the storms dir does not exist', async () => {
		const log = new StormLog({ cacheDir });
		expect(await log.readAll(baseNow)).toEqual([]);
	});

	it('keeps a stable path and one file per storm', async () => {
		const log = new StormLog({ cacheDir });
		await log.write([createEntry()], baseNow);
		const firstNames = readdirSync(stormsDir());
		await log.write(
			[
				createEntry({
					lastSeenAt: baseNow,
					timestamps: [
						baseNow - 10_000,
						baseNow - 5_000,
						baseNow - 1_000,
						baseNow,
					],
					sampleProposalIds: ['x2', 'x3'],
				}),
			],
			baseNow,
		);
		expect(readdirSync(stormsDir())).toEqual(firstNames);
		expect(firstNames).toHaveLength(1);
	});

	it('merges writes for the same storm', async () => {
		const log = new StormLog({ cacheDir });
		await log.write([createEntry()], baseNow);
		await log.write(
			[
				createEntry({
					lastSeenAt: baseNow + 1_000,
					timestamps: [
						baseNow - 5_000,
						baseNow - 1_000,
						baseNow + 1_000,
					],
					sampleProposalIds: ['x2', 'x3', 'x4', 'x5', 'x6'],
				}),
			],
			baseNow + 1_000,
		);
		const entry = await log.readOne(
			'slice',
			'WORKSPACE_HAS_NO_FILES',
			baseNow + 1_000,
		);
		expect(entry).toEqual({
			trigger: 'slice',
			code: 'WORKSPACE_HAS_NO_FILES',
			firstSeenAt: baseNow - 10_000,
			lastSeenAt: baseNow + 1_000,
			timestamps: [
				baseNow - 10_000,
				baseNow - 5_000,
				baseNow - 1_000,
				baseNow + 1_000,
			],
			sampleProposalIds: ['x2', 'x3', 'x4', 'x5', 'x6'],
			suggestedFix: 'check resolve-scope.ts',
		});
	});

	it('does not lose concurrent updates for the same storm', async () => {
		const log = new StormLog({ cacheDir });
		await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				log.write(
					[
						createEntry({
							lastSeenAt: baseNow + index,
							timestamps: [baseNow - 10_000 + index * 10],
							sampleProposalIds: [`x${index + 1}`],
						}),
					],
					baseNow + index,
				),
			),
		);
		const entry = await log.readOne(
			'slice',
			'WORKSPACE_HAS_NO_FILES',
			baseNow + 10,
		);
		expect(entry?.timestamps).toHaveLength(8);
		expect(entry?.timestamps).toEqual(
			Array.from(
				{ length: 8 },
				(_, index) => baseNow - 10_000 + index * 10,
			),
		);
	});

	it('reads legacy json entries', async () => {
		const log = new StormLog({ cacheDir });
		await log.ensureDir();
		writeFileSync(
			join(stormsDir(), 'legacy.json'),
			JSON.stringify(createEntry()),
			'utf8',
		);
		const entries = await log.readAll(baseNow);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.code).toBe('WORKSPACE_HAS_NO_FILES');
	});

	it('prunes storms older than maxAgeMs on read', async () => {
		const log = new StormLog({ cacheDir, maxAgeMs: 1_000 });
		await log.write(
			[
				createEntry({
					code: 'OLD',
					firstSeenAt: baseNow - 5_000,
					lastSeenAt: baseNow - 5_000,
					timestamps: [baseNow - 5_000],
					sampleProposalIds: [],
				}),
				createEntry({
					code: 'NEW',
					firstSeenAt: baseNow - 500,
					lastSeenAt: baseNow - 100,
					timestamps: [baseNow - 500, baseNow - 100],
					sampleProposalIds: [],
				}),
			],
			baseNow,
		);
		const entries = await log.readAll(baseNow);
		expect(entries.map((entry) => entry.code)).toEqual(['NEW']);
		expect(readdirSync(stormsDir())).toHaveLength(1);
	});

	it('quarantines corrupt files and accepts a valid incoming write', async () => {
		const log = new StormLog({ cacheDir });
		await log.write([createEntry()], baseNow);
		const targetName = readdirSync(stormsDir())[0];
		expect(targetName).toBeDefined();
		if (targetName === undefined) {
			throw new Error('expected a deterministic storm log file');
		}
		writeFileSync(
			join(stormsDir(), targetName),
			'{ not valid json',
			'utf8',
		);
		await log.write(
			[
				createEntry({
					lastSeenAt: baseNow + 1_000,
					timestamps: [baseNow + 1_000],
					sampleProposalIds: ['x9'],
				}),
			],
			baseNow + 1_000,
		);
		const names = readdirSync(stormsDir());
		expect(names).toContain(targetName);
		expect(names.some((name) => name.includes('.corrupt-'))).toBe(true);
		const entry = await log.readOne(
			'slice',
			'WORKSPACE_HAS_NO_FILES',
			baseNow + 1_000,
		);
		expect(entry?.timestamps).toEqual([baseNow + 1_000]);
	});

	it('replays exact timestamps into the detector after restart', async () => {
		const log = new StormLog({ cacheDir });
		const entry = createEntry({
			lastSeenAt: baseNow,
			timestamps: [
				baseNow - 3_000,
				baseNow - 2_000,
				baseNow - 1_000,
				baseNow,
			],
			sampleProposalIds: ['x1', 'x2', 'x3'],
		});
		await log.write([entry], baseNow);

		const replayed: number[] = [];
		await log.replayInto(
			{
				observe(event) {
					replayed.push(event.timestamp);
				},
			},
			baseNow,
		);
		expect(replayed).toEqual(entry.timestamps);

		const detector = new StormDetector();
		await log.replayInto(detector, baseNow);
		const snapshot = detector.snapshot(baseNow);
		expect(snapshot.storms).toHaveLength(1);
		expect(snapshot.storms[0]?.count).toBe(4);
		expect(snapshot.storms[0]?.lastSeenAt).toBe(baseNow);
	});

	it('replay preserves historical firstSeenAt and all retained samples after pruning', async () => {
		const log = new StormLog({ cacheDir, maxAgeMs: 30_000 });
		await log.write(
			[
				createEntry({
					firstSeenAt: baseNow - 90_000,
					lastSeenAt: baseNow,
					timestamps: [
						baseNow - 40_000,
						baseNow - 20_000,
						baseNow - 10_000,
						baseNow,
					],
					sampleProposalIds: ['x1', 'x2', 'x3', 'x4', 'x5'],
				}),
			],
			baseNow,
		);

		const detector = new StormDetector({ maxSamplesPerStorm: 5 });
		await log.replayInto(detector, baseNow);

		const storm = detector.snapshot(baseNow).storms[0];

		expect(storm?.firstSeenAt).toBe(baseNow - 90_000);
		expect(storm?.windowStartedAt).toBe(baseNow - 20_000);
		expect(storm?.count).toBe(3);
		expect(storm?.sampleProposalIds).toEqual([
			'x1',
			'x2',
			'x3',
			'x4',
			'x5',
		]);
	});

	it('falls back to observe replay while preserving all sample proposal ids order near the tail', async () => {
		const log = new StormLog({ cacheDir });
		const entry = createEntry({
			lastSeenAt: baseNow,
			timestamps: [
				baseNow - 4_000,
				baseNow - 3_000,
				baseNow - 2_000,
				baseNow - 1_000,
				baseNow,
			],
			sampleProposalIds: ['x1', 'x2', 'x3'],
		});
		await log.write([entry], baseNow);

		const replayed = await (async () => {
			const events: Array<{ timestamp: number; proposalId?: string }> =
				[];
			await log.replayInto(
				{
					observe(event) {
						events.push({
							timestamp: event.timestamp,
							...(event.proposalId !== undefined
								? { proposalId: event.proposalId }
								: {}),
						});
					},
				},
				baseNow,
			);
			return events;
		})();

		expect(replayed.map((event) => event.timestamp)).toEqual(
			entry.timestamps,
		);
		expect(replayed.map((event) => event.proposalId)).toEqual([
			undefined,
			undefined,
			'x1',
			'x2',
			'x3',
		]);
	});
});
