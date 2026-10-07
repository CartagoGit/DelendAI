import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readQuotaSnapshot } from '../../../../src/lib/quota/read-quota';

describe('readQuotaSnapshot', () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'or-quota-'));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('returns an empty, present:false snapshot when the file is missing', async () => {
		const snap = await readQuotaSnapshot(join(dir, 'nope.json'));
		expect(snap).toEqual({
			present: false,
			updatedAt: null,
			providers: {},
		});
	});

	it('parses a valid snapshot and marks it present', async () => {
		const path = join(dir, 'quotas.json');
		await writeFile(
			path,
			JSON.stringify({
				updatedAt: '2026-07-04T00:00:00.000Z',
				providers: {
					'claude-code': [
						{
							window: 'monthly',
							limit: 100,
							used: 10,
							resetAt: '2026-08-01T00:00:00.000Z',
						},
					],
				},
			}),
		);
		const snap = await readQuotaSnapshot(path);
		expect(snap.present).toBe(true);
		expect(snap.updatedAt).toBe('2026-07-04T00:00:00.000Z');
		expect(snap.providers['claude-code']?.[0]?.window).toBe('monthly');
	});

	it('treats corrupt JSON as no-data (never throws)', async () => {
		const path = join(dir, 'corrupt.json');
		await writeFile(path, '{ not valid json');
		const snap = await readQuotaSnapshot(path);
		expect(snap.present).toBe(false);
		expect(snap.providers).toEqual({});
	});

	it('tolerates a valid-JSON snapshot missing its fields', async () => {
		const path = join(dir, 'partial.json');
		await writeFile(path, JSON.stringify({ hello: 'world' }));
		const snap = await readQuotaSnapshot(path);
		expect(snap.present).toBe(true);
		expect(snap.updatedAt).toBeNull();
		expect(snap.providers).toEqual({});
	});
});
