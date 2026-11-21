/**
 * index-reader-parity.spec.ts — the reader's verdict, asked by a writer.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IProposalIndexEntry } from '../../../../src/lib/proposals/index-reader';
import { projectionParity } from '../../../../src/lib/proposals/index-reader-parity';

const JSON_ENTRIES: readonly IProposalIndexEntry[] = [
	{ id: 'f00535', file: 'ready/feats/f00535-cutover.md', status: 'ready' },
	{ id: 'q00022', file: 'in-progress/q00022-plan.md', status: 'in-progress' },
];

const INDEX_JSON = JSON.stringify({
	generated_at: '2026-09-08T00:00:00.000Z',
	count: JSON_ENTRIES.length,
	proposals: JSON_ENTRIES,
});

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const emptyWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'index-parity-'));
	roots.push(root);
	return root;
};

describe('projectionParity — the verdict the reader acts on, asked by the writer', () => {
	/** A real index file, since the question reads the registry itself. */
	const indexOnDisk = (): string => {
		const root = emptyWorkspace();
		const dir = join(root, '.cache', 'delendai', 'proposals');
		mkdirSync(dir, { recursive: true });
		const indexPath = join(dir, 'index.json');
		writeFileSync(indexPath, INDEX_JSON, 'utf8');
		return indexPath;
	};

	const sqlResult =
		(
			entries: readonly IProposalIndexEntry[] | null,
			sourceCommit: string | null = 'abc123',
		) =>
		async () =>
			entries === null
				? null
				: { entries, sourceCommit, logicalDigest: 'd' };

	it('answers parity when the database holds exactly what the registry holds', async () => {
		const verdict = await projectionParity(indexOnDisk(), {
			databasePath: '/db',
			readFromSqlResult: sqlResult(JSON_ENTRIES),
		});
		expect(verdict).toBe('parity');
	});

	it('answers divergence when a status differs', async () => {
		const [first, ...rest] = JSON_ENTRIES;
		const verdict = await projectionParity(indexOnDisk(), {
			databasePath: '/db',
			readFromSqlResult: sqlResult([
				{ ...(first as IProposalIndexEntry), status: 'done' },
				...rest,
			]),
		});
		expect(verdict).toBe('divergence');
	});

	it('answers metadata-missing for a database that never recorded its commit', async () => {
		const verdict = await projectionParity(indexOnDisk(), {
			databasePath: '/db',
			readFromSqlResult: sqlResult(JSON_ENTRIES, null),
		});
		expect(verdict).toBe('metadata-missing');
	});

	it('answers unavailable when there is no database to read', async () => {
		const verdict = await projectionParity(indexOnDisk(), {
			databasePath: '/db',
			readFromSqlResult: sqlResult(null),
		});
		expect(verdict).toBe('unavailable');
	});

	it('records no read and emits no notice, because it serves nothing', async () => {
		const notices: string[] = [];
		await projectionParity(indexOnDisk(), {
			databasePath: '/db',
			readFromSqlResult: sqlResult(null),
			log: (message) => notices.push(message),
		});
		expect(notices).toEqual([]);
	});
});
