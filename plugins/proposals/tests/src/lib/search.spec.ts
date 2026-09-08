import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import {
	runProposalsSearch,
	proposalsSearchInputSchema,
} from '../../../src/lib/tools/search.tool';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-search-'));
	roots.push(root);
	return root;
};

const insertProposal = (driver: ProposalsSqliteDriver, uid: string, title: string, kind = 'feat', status = 'ready'): void => {
	const now = Date.now();
	driver.handle.prepare(`INSERT INTO proposals (uid, slug, kind, status, title, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).run(uid, uid.replaceAll('/', '-'), kind, status, title, now, now);
};

describe('proposals_search (f00516 S2)', () => {
	it('validates the FTS input contract', () => {
		expect(proposalsSearchInputSchema.parse({ query: 'sqlite' })).toEqual({
			query: 'sqlite',
			limit: 20,
			offset: 0,
			prefix: false,
			mode: 'fts',
		});
	});

	it('returns bm25-ranked FTS hits with filters', async () => {
		const root = makeRoot();
		const sqlitePath = resolveProposalsDbPaths(root).databasePath;
		const driver = new ProposalsSqliteDriver({ path: sqlitePath });
		try {
			insertProposal(driver, 'f00516/one', 'SQLite migration search', 'feat', 'ready');
			insertProposal(driver, 'f00516/two', 'SQLite migration search extra', 'fix', 'done');
			insertProposal(driver, 'f00516/three', 'unrelated', 'feat', 'ready');
		} finally {
			driver.close();
		}
		const output = await runProposalsSearch({
			workspaceRoot: root,
			proposalsDirAbs: root,
			indexPathAbs: join(root, 'index.json'),
			namespacePrefix: 'proposals',
		}, { query: 'SQLite', kind: 'feat', status: 'ready' });
		expect(output.mode).toBe('fts');
		expect(output.hits.map((hit) => hit.uid)).toEqual(['f00516/one']);
		expect(output.hits[0]?.score).toBeLessThanOrEqual(0);
	});

	it('preserves title substring search in legacy mode', async () => {
		const root = makeRoot();
		const indexPath = join(root, 'index.json');
		const proposalPath = join(root, 'legacy.md');
		writeFileSync(proposalPath, '---\nid: x00001\nstatus: ready\n---\n# legacy search title\n', 'utf8');
		writeFileSync(indexPath, JSON.stringify({ proposals: [{ id: 'x00001', file: 'legacy.md', status: 'ready' }] }), 'utf8');
		const output = await runProposalsSearch({
			workspaceRoot: root,
			proposalsDirAbs: root,
			indexPathAbs: indexPath,
			namespacePrefix: 'proposals',
		}, { query: 'legacy search', mode: 'legacy' });
		expect(output.mode).toBe('legacy');
		expect(output.hits).toHaveLength(1);
		expect(output.hits[0]?.uid).toBe('x00001');
	});
});