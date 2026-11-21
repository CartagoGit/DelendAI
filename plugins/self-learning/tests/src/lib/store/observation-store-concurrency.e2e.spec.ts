/**
 * observation-store-concurrency.e2e.spec.ts — q00014 S4.
 *
 * Several writers racing on the real file mutex and the real filesystem.
 * That is the point of the test, so it cannot be faked, and it takes
 * ~330 ms: an e2e-tier spec, not a unit one.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	appendObservations,
	readObservations,
} from '../../../../src/lib/store/observation-store.service';

const readText = async (path: string): Promise<string | null> =>
	readFile(path, 'utf8').catch(() => null);

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('the observation store under concurrent writers', () => {
	it('[<1500ms] loses nothing when several writers append at once', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'self-learning-'));
		dirs.push(dir);
		const filePath = join(dir, 'observations.jsonl');

		await Promise.all(
			Array.from({ length: 12 }, (_, index) =>
				appendObservations({ filePath, readText }, [
					{
						kind: 'test-failure',
						subject: `case ${String(index)}`,
						outcome: 'fail',
						atMs: index + 1,
						source: 'test-journal',
					},
				]),
			),
		);

		expect(await readObservations({ filePath, readText })).toHaveLength(12);
	});
});
