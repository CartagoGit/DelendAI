import { afterEach, describe, expect, it } from 'vitest';

import {
	getProposalIndexReadStats,
	parityStatusOf,
	recordProposalIndexRead,
	resetProposalIndexReadStats,
} from '../../../../../src/lib/proposals/index-read-stats';
import { readProposalIndex } from '../../../../../src/lib/proposals/index-reader';
import { buildStorageModeCheck } from '../../../../../src/lib/services/db-doctor/checks/storage-mode';

const entry = { id: 'x00001', file: 'ready/x00001-a.md', status: 'ready' };
const noFs = {
	read: async () => JSON.stringify({ proposals: [entry] }),
};

afterEach(() => {
	resetProposalIndexReadStats();
});

describe('proposal index read stats', () => {
	it('counts only auto fallbacks and remembers the last outcome', () => {
		recordProposalIndexRead('sql-parity');
		recordProposalIndexRead('fallback-unavailable');
		recordProposalIndexRead('fallback-divergence', 3);
		recordProposalIndexRead('sql-refused');

		expect(getProposalIndexReadStats()).toEqual({
			reads: 4,
			fallbacks: 2,
			last: 'sql-refused',
			lastDivergence: 0,
		});
	});

	it('maps every outcome to a parity status', () => {
		expect(parityStatusOf(null)).toBe('not-observed');
		expect(parityStatusOf('sql-parity')).toBe('parity');
		expect(parityStatusOf('sql-divergence-reported')).toBe('divergent');
		expect(parityStatusOf('fallback-divergence')).toBe('divergent');
		expect(parityStatusOf('json-pinned')).toBe('not-compared');
		expect(parityStatusOf('fallback-unavailable')).toBe('unverified');
		expect(parityStatusOf('fallback-metadata-missing')).toBe('unverified');
		expect(parityStatusOf('sql-refused')).toBe('unverified');
	});

	it('records what readProposalIndex actually served', async () => {
		const read = (
			source: 'json' | 'sql' | 'auto',
			sql: {
				entries: (typeof entry)[];
				sourceCommit: string | null;
			} | null,
		) =>
			readProposalIndex(
				'/ws/.cache/delendai/proposals/index.json',
				noFs,
				{
					source,
					databasePath: '/ws/db.sqlite',
					log: () => undefined,
					readFromSqlResult: async () =>
						sql === null ? null : { ...sql, logicalDigest: null },
				},
			);

		await read('json', null);
		expect(getProposalIndexReadStats().last).toBe('json-pinned');

		await read('auto', { entries: [entry], sourceCommit: 'abc' });
		expect(getProposalIndexReadStats().last).toBe('sql-parity');

		await read('auto', { entries: [], sourceCommit: 'abc' });
		expect(getProposalIndexReadStats()).toMatchObject({
			last: 'fallback-divergence',
			lastDivergence: 1,
		});

		await read('auto', { entries: [entry], sourceCommit: null });
		expect(getProposalIndexReadStats().last).toBe(
			'fallback-metadata-missing',
		);

		await read('auto', null);
		expect(getProposalIndexReadStats().last).toBe('fallback-unavailable');

		await read('sql', { entries: [], sourceCommit: 'abc' });
		expect(getProposalIndexReadStats()).toMatchObject({
			last: 'sql-divergence-reported',
			lastDivergence: 1,
		});

		await read('sql', { entries: [entry], sourceCommit: 'abc' });
		expect(getProposalIndexReadStats().last).toBe('sql-parity');

		await expect(read('sql', null)).rejects.toThrow();
		expect(getProposalIndexReadStats()).toMatchObject({
			reads: 8,
			fallbacks: 3,
			last: 'sql-refused',
		});
	});
});

describe('storage_mode doctor check', () => {
	it('reports mode, canonical path, fallback count and parity', () => {
		const check = buildStorageModeCheck({
			mode: 'auto',
			databasePath: '/ws/.cache/delendai/state/proposals.sqlite',
			stats: {
				reads: 5,
				fallbacks: 0,
				last: 'sql-parity',
				lastDivergence: 0,
			},
		});

		expect(check).toEqual({
			name: 'storage_mode',
			severity: 'ok',
			message:
				'mode=auto; canonical path=/ws/.cache/delendai/state/proposals.sqlite; fallbacks=0 of 5 read(s); parity=parity.',
		});
	});

	it('warns on fallbacks and on divergence', () => {
		const fellBack = buildStorageModeCheck({
			mode: 'auto',
			databasePath: '/db',
			stats: {
				reads: 2,
				fallbacks: 1,
				last: 'fallback-unavailable',
				lastDivergence: 0,
			},
		});
		const diverged = buildStorageModeCheck({
			mode: 'sql',
			databasePath: '/db',
			stats: {
				reads: 1,
				fallbacks: 0,
				last: 'sql-divergence-reported',
				lastDivergence: 2,
			},
		});

		expect(fellBack.severity).toBe('warning');
		expect(fellBack.message).toContain('fallbacks=1 of 2');
		expect(diverged.severity).toBe('warning');
		expect(diverged.message).toContain('parity=divergent (2 id(s) differ)');
	});
});
