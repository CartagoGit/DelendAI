/**
 * index-reader-stale-registry.spec.ts — a registry export older than the
 * projection is stale, not divergent.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	readProposalIndex,
	type IProposalIndexEntry,
} from '../../../../src/lib/proposals/index-reader';
import {
	getProposalIndexReadStats,
	resetProposalIndexReadStats,
} from '../../../../src/lib/proposals/index-read-stats';

const OLD: readonly IProposalIndexEntry[] = [
	{ id: 'x00001', file: 'review/x00001-a.md', status: 'review' },
];
const NOW: readonly IProposalIndexEntry[] = [
	{ id: 'x00001', file: 'done/fixes/x00001-a.md', status: 'done' },
];

const roots: string[] = [];
beforeEach(resetProposalIndexReadStats);
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const registryWritten = (generatedAt: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'stale-registry-'));
	roots.push(root);
	const dir = join(root, '.cache', 'delendai', 'proposals');
	mkdirSync(dir, { recursive: true });
	const path = join(dir, 'index.json');
	writeFileSync(
		path,
		JSON.stringify({ generated_at: generatedAt, count: 1, proposals: OLD }),
	);
	return path;
};

const read = (path: string, reconciledAt: number, said: string[]) =>
	readProposalIndex(path, undefined, {
		source: 'sql',
		databasePath: '/db',
		readFromSqlResult: async () => ({
			entries: NOW,
			sourceCommit: 'abc123',
			logicalDigest: 'd',
			reconciledAt,
		}),
		log: (message) => said.push(message),
	});

describe('a registry export older than the projection', () => {
	it('is served past without a word of divergence', async () => {
		const said: string[] = [];
		const entries = await read(
			registryWritten('2026-10-05T22:05:21.852Z'),
			Date.parse('2026-10-07T08:00:00.000Z'),
			said,
		);
		expect(entries).toEqual(NOW);
		expect(said.some((line) => line.includes('differs on'))).toBe(false);
		expect(getProposalIndexReadStats().last).toBe('sql-registry-stale');
	});

	it('is still compared when it is the newer of the two', async () => {
		const said: string[] = [];
		await read(
			registryWritten('2026-10-07T09:00:00.000Z'),
			Date.parse('2026-10-07T08:00:00.000Z'),
			said,
		);
		expect(getProposalIndexReadStats().last).toBe(
			'sql-divergence-reported',
		);
	});
});
