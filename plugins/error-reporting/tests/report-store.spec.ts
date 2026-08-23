import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createReportStore } from '../src/lib/report-store';

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-'));
	tmpDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tmpDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe('createReportStore', () => {
	it('records and reads back a record with an issue number', async () => {
		const store = createReportStore(await makeDir());
		await store.record('tool_x::boom', {
			issueNumber: 42,
			issueUrl: 'https://github.com/o/r/issues/42',
			at: '2026-08-24T00:00:00.000Z',
		});
		const record = await store.get('tool_x::boom');
		expect(record).toBeDefined();
		expect(record?.issueNumber).toBe(42);
		expect(record?.count).toBe(1);
	});

	it('increments the counter and keeps the first issue link', async () => {
		const store = createReportStore(await makeDir());
		await store.record('sig', {
			issueNumber: 1,
			at: '2026-08-24T00:00:00.000Z',
		});
		await store.record('sig', { at: '2026-08-24T01:00:00.000Z' });
		const record = await store.get('sig');
		expect(record?.count).toBe(2);
		expect(record?.issueNumber).toBe(1);
		expect(record?.lastReportedAt).toBe('2026-08-24T01:00:00.000Z');
	});

	it('returns undefined for an unknown signature and tolerates a corrupt file', async () => {
		const dir = await makeDir();
		const store = createReportStore(dir);
		expect(await store.get('missing')).toBeUndefined();
		await import('node:fs/promises').then(({ writeFile }) =>
			writeFile(join(dir, 'reported.json'), '{not json', 'utf8'),
		);
		expect(await store.get('missing')).toBeUndefined();
	});
});
