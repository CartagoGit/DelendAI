import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getProposalIndexReadStats } from '../../../../src/lib/proposals/index-read-stats';
import { readProposalIndex } from '../../../../src/lib/proposals/index-reader';
import { ProposalIndexSqlUnavailableError } from '../../../../src/lib/proposals/proposal-errors';
import {
	INDEX_PATH,
	JSON_ENTRIES,
	emptyWorkspace,
	fakeFs,
} from './index-reader-workspace';

describe('readProposalIndex — sql rebuilds from markdown before giving up (q00022 S4 phase 2)', () => {
	it('rebuilds when the database is missing, then serves the rebuilt projection', async () => {
		let sqlCalls = 0;
		let rebuildCalls = 0;
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'sql',
			databasePath: '/fake/proposals.sqlite',
			// The workspace root exists; the database file does not.
			pathExists: (path) => path === '/fake',
			readFromSqlResult: async () => {
				sqlCalls += 1;
				return sqlCalls === 1
					? null
					: {
							entries: JSON_ENTRIES,
							sourceCommit: 'rebuilt-sha',
							logicalDigest: 'd',
						};
			},
			rebuildProjection: (input) => {
				rebuildCalls += 1;
				expect(input.root).toBe('/fake');
				expect(input.proposalsDir).toBe('docs/delendai/proposals');
				return { status: 'refreshed', lines: [] };
			},
			log: () => undefined,
		});
		expect(entries).toEqual(JSON_ENTRIES);
		expect(rebuildCalls).toBe(1);
		expect(sqlCalls).toBe(2);
		expect(getProposalIndexReadStats().rebuilds).toBe(1);
	});

	it('rebuilds an existing database that was opened but never stamped', async () => {
		let calls = 0;
		let rebuildCalls = 0;
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'sql',
			databasePath: '/fake/proposals.sqlite',
			pathExists: () => true,
			readFromSqlResult: async () => {
				calls += 1;
				return calls === 1
					? { entries: [], sourceCommit: null, logicalDigest: null }
					: {
							entries: JSON_ENTRIES,
							sourceCommit: 'sha',
							logicalDigest: 'd',
						};
			},
			rebuildProjection: () => {
				rebuildCalls += 1;
				return { status: 'refreshed', lines: [] };
			},
			log: () => undefined,
		});
		expect(entries).toEqual(JSON_ENTRIES);
		expect(rebuildCalls).toBe(1);
	});

	it('never rebuilds over a database that exists but could not be opened', async () => {
		let rebuildCalls = 0;
		await expect(
			readProposalIndex(INDEX_PATH, fakeFs(), {
				source: 'sql',
				databasePath: '/fake/proposals.sqlite',
				// Both the workspace root AND the database file exist —
				// this reader simply could not open it. That is corrupt,
				// not missing.
				pathExists: () => true,
				readFromSql: async () => null,
				rebuildProjection: () => {
					rebuildCalls += 1;
					return { status: 'refreshed', lines: [] };
				},
				log: () => undefined,
			}),
		).rejects.toMatchObject({
			name: 'ProposalIndexSqlUnavailableError',
			failure: 'unavailable',
		});
		expect(rebuildCalls).toBe(0);
	});

	it('never attempts a rebuild when the workspace root does not exist', async () => {
		let rebuildCalls = 0;
		await expect(
			readProposalIndex(INDEX_PATH, fakeFs(), {
				source: 'sql',
				databasePath: '/fake/proposals.sqlite',
				pathExists: () => false,
				readFromSql: async () => null,
				rebuildProjection: () => {
					rebuildCalls += 1;
					return { status: 'refreshed', lines: [] };
				},
				log: () => undefined,
			}),
		).rejects.toBeInstanceOf(ProposalIndexSqlUnavailableError);
		expect(rebuildCalls).toBe(0);
	});

	it('still throws when the rebuild ran but the projection still cannot serve', async () => {
		let rebuildCalls = 0;
		await expect(
			readProposalIndex(INDEX_PATH, fakeFs(), {
				source: 'sql',
				databasePath: '/fake/proposals.sqlite',
				pathExists: (path) => path === '/fake',
				readFromSql: async () => null,
				rebuildProjection: () => {
					rebuildCalls += 1;
					return {
						status: 'failed',
						lines: ['the reconciler rejected the candidate'],
					};
				},
				log: () => undefined,
			}),
		).rejects.toBeInstanceOf(ProposalIndexSqlUnavailableError);
		expect(rebuildCalls).toBe(1);
		expect(getProposalIndexReadStats().rebuilds).toBe(1);
	});
});

describe('readProposalIndex — a fresh consumer workspace with no .cache at all (q00022 S4 phase 2)', () => {
	const PROJECTABLE_PROPOSAL = (id: string): string =>
		`---
id: ${id}
title: Fixture ${id}
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-30
---

# Fixture ${id}

Body of ${id}.
`;

	it('reads the default (sql) source correctly with no database and no registry', async () => {
		const root = emptyWorkspace();
		const proposalsDir = join(root, 'docs/delendai/proposals/ready');
		mkdirSync(proposalsDir, { recursive: true });
		writeFileSync(
			join(proposalsDir, 'x09991-fixture.md'),
			PROJECTABLE_PROPOSAL('x09991'),
			'utf8',
		);
		const indexPathAbs = join(
			root,
			'.cache',
			'delendai',
			'proposals',
			'index.json',
		);

		// No `source` option, no env override: the default is `sql`, and
		// there is neither a database nor a registry at this path yet —
		// exactly the "consumer project" case q00022 S4 phase 2 exists for.
		const entries = await readProposalIndex(indexPathAbs, undefined, {
			workspaceRoot: root,
			log: () => undefined,
		});

		expect(entries).toEqual([
			{
				id: 'x09991',
				file: 'ready/x09991-fixture.md',
				status: 'ready',
				title: 'Fixture x09991',
				track: 'architecture',
				kind: 'feat',
				date: '2026-09-30',
			},
		]);
		expect(getProposalIndexReadStats().rebuilds).toBe(1);
	});
});

describe('readProposalIndex — sql with no JSON registry on disk', () => {
	it('serves the projection without calling every id a divergence', async () => {
		// A fresh worktree has no `index.json`. That is nothing to compare,
		// and reporting the whole backlog as divergent drowned the log.
		const messages: string[] = [];
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(null), {
			source: 'sql',
			databasePath: '/fake/proposals.sqlite',
			readFromSqlResult: async () => ({
				entries: JSON_ENTRIES,
				sourceCommit: 'abc123',
				logicalDigest: 'digest',
			}),
			log: (message) => messages.push(message),
		});
		expect(entries).toEqual(JSON_ENTRIES);
		expect(messages).toEqual([]);
		expect(getProposalIndexReadStats().last).toBe('sql-parity');
	});
});
