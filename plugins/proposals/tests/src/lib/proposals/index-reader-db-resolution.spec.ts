/**
 * index-reader-db-resolution.spec.ts — WHICH database a proposal-index
 * read belongs to.
 *
 * Split out of `index-reader-sql.spec.ts`: that file pins what the SQL
 * reader returns once it has a database; this one pins how the database
 * is chosen in the first place, which is a different question with a
 * different failure mode — answering it from the process's working
 * directory opens another project's repository.
 *
 * `bun test`, never vitest: resolving the canonical path reaches
 * `@delendai/proposals-sqlite`, which vitest cannot resolve.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';

import { readProposalIndex } from '../../../../src/lib/proposals/index-reader';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'f00535-db-resolution-'));
	roots.push(root);
	return root;
};

describe('resolving which database a read belongs to', () => {
	/**
	 * Records the database path the SQL source was asked for, if any.
	 *
	 * `auto`, not `sql`: this spec is about WHICH database a read resolves
	 * to, and its second case asserts that JSON answers when no database
	 * can be resolved — the fallback, which strict `sql` now refuses.
	 */
	const askedPaths = async (
		indexPath: string,
	): Promise<readonly string[]> => {
		const asked: string[] = [];
		await readProposalIndex(indexPath, undefined, {
			source: 'auto',
			env: {},
			log: () => {},
			readFromSqlResult: async (databasePath) => {
				asked.push(databasePath);
				return null;
			},
		});
		return asked;
	};

	/** Lays out `<root>/.cache/delendai/proposals/index.json`. */
	const writeCanonicalIndex = (root: string): string => {
		const indexPath = join(
			root,
			'.cache',
			'delendai',
			'proposals',
			'index.json',
		);
		mkdirSync(dirname(indexPath), { recursive: true });
		writeFileSync(indexPath, JSON.stringify({ proposals: [] }), 'utf8');
		return indexPath;
	};

	it('derives the workspace from the index path the caller resolved', async () => {
		// The index path is the one thing every call site already has, and
		// it names the workspace being read. Deriving the database from it
		// is what keeps the SQL source reachable in production, where no
		// caller passes a `workspaceRoot`.
		const root = makeRoot();
		const indexPath = writeCanonicalIndex(root);

		expect(await askedPaths(indexPath)).toEqual([
			resolveProposalsDbPaths(root).databasePath,
		]);
	});

	it('does not guess the project from the process working directory', async () => {
		// An MCP server's working directory is wherever the host happened
		// to launch it, which in a multi-project setup is frequently
		// another project entirely. Resolving the proposals database from
		// it would read — and eventually write — somebody else's
		// repository.
		//
		// So the process is parked inside a perfectly workspace-shaped
		// directory while the index being read is NOT in the canonical
		// layout: the only answer that is not a guess is "the SQL source
		// cannot serve", and JSON answers instead.
		const elsewhere = makeRoot();
		mkdirSync(join(elsewhere, '.cache', 'delendai', 'state'), {
			recursive: true,
		});
		const indexPath = join(makeRoot(), 'index.json');
		writeFileSync(
			indexPath,
			JSON.stringify({
				proposals: [{ id: 'f00001', file: 'docs/one.md' }],
			}),
			'utf8',
		);

		const previousCwd = process.cwd();
		process.chdir(elsewhere);
		try {
			expect(await askedPaths(indexPath)).toEqual([]);
			const entries = await readProposalIndex(indexPath, undefined, {
				source: 'auto',
				env: {},
				log: () => {},
			});
			expect(entries.map((entry) => entry.id)).toEqual(['f00001']);
		} finally {
			process.chdir(previousCwd);
		}
	});
});
