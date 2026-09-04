/**
 * storm-log.spec.ts — coverage for the x00419 S4 persistence layer.
 *
 * The StormLog reads/writes JSON files under `<cacheDir>/storms/`.
 * Tests use a temp directory so they never touch the real `.cache/`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StormLog } from '@delendai/commit-policy/lib/services/storm-log';
import { StormDetector } from '@delendai/commit-policy/lib/services/storm-detector';

describe('StormLog (x00419 S4)', () => {
	let cacheDir: string;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), 'storm-log-test-'));
	});

	afterEach(() => {
		rmSync(cacheDir, { recursive: true, force: true });
	});

	it('returns an empty list when the storms dir does not exist', () => {
		const log = new StormLog({ cacheDir });
		expect(log.readAll()).toEqual([]);
	});

	it('writes and reads back entries round-trip', () => {
		const log = new StormLog({ cacheDir });
		const now = Date.now();
		log.write([
			{
				trigger: 'slice',
				code: 'WORKSPACE_HAS_NO_FILES',
				firstSeenAt: now - 10_000,
				lastSeenAt: now - 1_000,
				timestamps: [now - 10_000, now - 5_000, now - 1_000],
				sampleProposalIds: ['x1', 'x2'],
				suggestedFix: 'check resolve-scope.ts',
			},
		]);
		const entries = log.readAll();
		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry?.code).toBe('WORKSPACE_HAS_NO_FILES');
		expect(entry?.trigger).toBe('slice');
		expect(entry?.sampleProposalIds).toEqual(['x1', 'x2']);
		expect(entry?.suggestedFix).toBe('check resolve-scope.ts');
	});

	it('evicts entries older than maxAgeMs on read', () => {
		const log = new StormLog({ cacheDir, maxAgeMs: 1_000 });
		const now = Date.now();
		log.write([
			{
				trigger: 'slice',
				code: 'OLD',
				firstSeenAt: now - 10_000,
				lastSeenAt: now - 5_000,
				timestamps: [now - 10_000, now - 5_000],
				sampleProposalIds: [],
			},
			{
				trigger: 'slice',
				code: 'NEW',
				firstSeenAt: now - 100,
				lastSeenAt: now - 50,
				timestamps: [now - 100, now - 50],
				sampleProposalIds: [],
			},
		]);
		const entries = log.readAll(now);
		expect(entries.map((e) => e.code)).toEqual(['NEW']);
	});

	it('replayInto() restores the detector state from disk', () => {
		const log = new StormLog({ cacheDir });
		const now = Date.now();
		log.write([
			{
				trigger: 'slice',
				code: 'WORKSPACE_HAS_NO_FILES',
				firstSeenAt: now - 10_000,
				lastSeenAt: now - 1_000,
				timestamps: [now - 10_000, now - 5_000, now - 1_000],
				sampleProposalIds: ['x1', 'x2', 'x3'],
			},
		]);

		const detector = new StormDetector();
		log.replayInto(detector);
		const snap = detector.snapshot(now);
		expect(snap.storms).toHaveLength(1);
		expect(snap.storms[0]?.count).toBe(3);
		expect(snap.storms[0]?.code).toBe('WORKSPACE_HAS_NO_FILES');
	});

	it('survives corrupt JSON files without throwing', () => {
		const log = new StormLog({ cacheDir });
		log.ensureDir();
		const { writeFileSync } =
			require('node:fs') as typeof import('node:fs');
		writeFileSync(
			join(cacheDir, 'storms', 'corrupt__X.json'),
			'{ this is not valid JSON',
			'utf8',
		);
		expect(() => log.readAll()).not.toThrow();
		expect(log.readAll()).toEqual([]);
	});
});
